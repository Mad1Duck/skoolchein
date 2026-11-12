import { decodeErrorResult, formatUnits, toFunctionSelector, type Abi } from 'viem';
import * as abis from '@/constants/contractsV4';
import { MESSAGES_EN, MESSAGES_ID, type Msg } from './messages';

type Lang = 'id' | 'en';
type Vars = Record<string, string | number | bigint>;

/** Every custom error declared by any v4 contract, merged (by name) into one ABI for decoding. */
const ERROR_ABI: Abi = (() => {
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const v of Object.values(abis)) {
    if (!Array.isArray(v)) continue;
    for (const item of v as { type?: string; name?: string }[]) {
      if (item?.type !== 'error' || !item.name || seen.has(item.name)) continue;
      seen.add(item.name);
      out.push(item);
    }
  }
  return out as Abi;
})();

/** selector -> error name, for payloads that carry no arguments (or truncated ones). */
const SELECTORS = new Map<string, string>(
  (ERROR_ABI as { type: string; name: string; inputs?: { type: string }[] }[])
    .filter((x) => x.type === 'error')
    .map((x) => [toFunctionSelector(`${x.name}(${(x.inputs ?? []).map((i) => i.type).join(',')})`), x.name]),
);

const PROGRAM_STATUS = ['CREATED', 'APPLICATION_OPEN', 'SCREENING', 'VOTING', 'ACTIVE', 'COMPLETED', 'CANCELLED'];
const PROGRAM_STATUS_LABEL: Record<Lang, Record<string, string>> = {
  en: { CREATED: 'Created', APPLICATION_OPEN: 'Applications open', SCREENING: 'Screening', VOTING: 'Voting', ACTIVE: 'Running', COMPLETED: 'Completed', CANCELLED: 'Cancelled' },
  id: { CREATED: 'Dibuat', APPLICATION_OPEN: 'Pendaftaran dibuka', SCREENING: 'Seleksi', VOTING: 'Pemilihan', ACTIVE: 'Berjalan', COMPLETED: 'Selesai', CANCELLED: 'Dibatalkan' },
};
const MILESTONE_STATUS = ['PROPOSED', 'APPROVED', 'REJECTED', 'PENDING', 'SUBMITTED', 'DISPUTED', 'COMPLETED', 'FROZEN'];

/** Find the revert payload (0x + 4-byte selector + args) anywhere in a viem/wagmi error chain. */
function extractRevertData(error: unknown): `0x${string}` | undefined {
  const isHex = (v: unknown): v is `0x${string}` => typeof v === 'string' && /^0x[0-9a-fA-F]{8,}$/.test(v);
  const e = error as { walk?: (fn: (x: unknown) => boolean) => unknown; message?: string } | null;
  try {
    const hit = e?.walk?.((x) => {
      const o = x as { data?: unknown; raw?: unknown } | null;
      return isHex(o?.raw) || isHex(o?.data);
    }) as { data?: unknown; raw?: unknown } | undefined;
    if (hit) return (isHex(hit.raw) ? hit.raw : hit.data) as `0x${string}`;
  } catch {
    /* fall through to the message scan */
  }
  // RPC nodes report e.g. "custom error 0x57405680" or "reverted with the following signature: 0x..."
  const m = /(?:custom error|signature:?)\s*(0x[0-9a-fA-F]{8,})/i.exec(String(e?.message ?? error ?? ''));
  return m ? (m[1] as `0x${string}`) : undefined;
}

function fmtDate(sec: bigint, lang: Lang) {
  return new Date(Number(sec) * 1000).toLocaleString(lang === 'id' ? 'id-ID' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function fmtArgs(name: string, args: Record<string, unknown>, lang: Lang): Vars {
  const out: Vars = {};
  for (const [k, raw] of Object.entries(args)) {
    if (typeof raw === 'bigint') {
      if (name.startsWith('ERC20Insufficient') && k !== 'spender' && k !== 'sender') {
        out[k] = Number(formatUnits(raw, 6)).toLocaleString(lang === 'id' ? 'id-ID' : 'en-US', { maximumFractionDigits: 6 });
      } else if (k === 'freezeUntil' || k === 'cooldownUntil') out[k] = fmtDate(raw, lang);
      else out[k] = raw.toString();
    } else if (typeof raw === 'number') {
      if (name === 'InvalidProgramStatus' && (k === 'expected' || k === 'actual')) {
        out[k] = PROGRAM_STATUS_LABEL[lang][PROGRAM_STATUS[raw]] ?? String(raw);
      } else if (name === 'WrongStatus') out[k] = MILESTONE_STATUS[raw] ?? String(raw);
      else out[k] = raw;
    } else if (typeof raw === 'string') {
      out[k] = /^0x[0-9a-fA-F]{40}$/.test(raw) ? `${raw.slice(0, 6)}…${raw.slice(-4)}` : raw;
    }
  }
  return out;
}

function fill(template: string, vars: Vars) {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : '…'));
}

export type ExplainedError = {
  /** 'rejected' means the user cancelled in their wallet: not a failure. */
  kind: 'rejected' | 'known' | 'unknown';
  /** On-chain error name when it could be decoded. */
  name?: string;
  /** Why it was refused. */
  reason: string;
  /** What to change. */
  fix: string;
  /** Raw detail for support / debugging (never the primary message). */
  technical: string;
};

/**
 * Turn any wallet/contract error into "why it failed" + "what to fix".
 * `ctx` carries values the contract does not echo back (form inputs, protocol limits),
 * e.g. { min: 5, max: 20, maxCandidates: 150 }.
 */
export function explainError(error: unknown, lang: Lang, ctx: Vars = {}): ExplainedError {
  const raw = String((error as { shortMessage?: string; message?: string } | null)?.shortMessage ?? (error as { message?: string } | null)?.message ?? error ?? '');
  const lower = raw.toLowerCase();
  const technical = raw.slice(0, 600);

  if (lower.includes('user rejected') || lower.includes('user denied') || lower.includes('rejected the request')) {
    return lang === 'id'
      ? { kind: 'rejected', reason: 'Anda membatalkan permintaan di wallet.', fix: 'Tidak ada dana yang terpakai. Tekan tombolnya lagi bila ingin melanjutkan.', technical }
      : { kind: 'rejected', reason: 'You cancelled the request in your wallet.', fix: 'Nothing was charged. Press the button again to continue.', technical };
  }

  const messages: Record<string, Msg> = lang === 'id' ? MESSAGES_ID : MESSAGES_EN;
  let name: string | undefined;
  let args: Record<string, unknown> = {};

  const data = extractRevertData(error);
  if (data) {
    try {
      const d = decodeErrorResult({ abi: ERROR_ABI, data });
      name = d.errorName;
      const names = (ERROR_ABI.find((x) => x.type === 'error' && x.name === d.errorName) as { inputs?: { name?: string }[] } | undefined)?.inputs ?? [];
      const list = (d.args ?? []) as unknown[];
      args = Object.fromEntries(names.map((n, i) => [n.name || `arg${i}`, list[i]]));
    } catch {
      name = SELECTORS.get(data.slice(0, 10).toLowerCase());
    }
  }
  // viem already decoded it for ABI-listed errors and prints the name in the message.
  if (!name) name = Object.keys(messages).find((k) => lower.includes(k.toLowerCase()));

  const msg = name ? messages[name] : undefined;
  if (name && msg) {
    const vars: Vars = { ...ctx, ...fmtArgs(name, args, lang) };
    // Some nodes return the bare selector without amounts: use wording that needs none.
    if (name.startsWith('ERC20Insufficient') && !('needed' in vars)) {
      const allowance = name === 'ERC20InsufficientAllowance';
      return {
        kind: 'known',
        name,
        reason: allowance
          ? lang === 'id' ? 'Izin penggunaan USDC yang Anda berikan kurang dari jumlah yang dibutuhkan.' : 'The USDC spending permission you gave is less than the amount needed.'
          : lang === 'id' ? 'Saldo USDC di wallet Anda kurang dari jumlah yang dibutuhkan.' : 'Your wallet’s USDC balance is less than the amount needed.',
        fix: allowance
          ? lang === 'id' ? 'Ulangi langkah “izinkan dana” dengan jumlah minimal sebesar total yang akan dibayar, lalu coba lagi.' : 'Repeat the “allow funds” step with at least the total you will pay, then try again.'
          : lang === 'id' ? 'Isi saldo USDC (Isi Saldo) atau kecilkan jumlahnya.' : 'Add USDC to your wallet (Add Funds) or lower the amount.',
        technical,
      };
    }
    return { kind: 'known', name, reason: fill(msg.reason, vars), fix: fill(msg.fix, vars), technical };
  }

  if (lower.includes('insufficient funds') || lower.includes('exceeds balance') || lower.includes('transfer amount exceeds')) {
    return lang === 'id'
      ? { kind: 'known', reason: 'Saldo tidak cukup untuk membayar jumlah atau biaya jaringan.', fix: 'Isi saldo (USDC untuk jumlahnya, dan sedikit dana untuk biaya jaringan), atau kecilkan jumlahnya.', technical }
      : { kind: 'known', reason: 'Your balance is not enough for the amount or the network fee.', fix: 'Add funds (USDC for the amount, plus a little for the network fee) or lower the amount.', technical };
  }
  if (lower.includes('network') || lower.includes('timeout') || lower.includes('failed to fetch')) {
    return lang === 'id'
      ? { kind: 'unknown', reason: 'Tidak bisa terhubung ke jaringan.', fix: 'Periksa koneksi internet dan pilihan jaringan, lalu coba lagi.', technical }
      : { kind: 'unknown', reason: 'Could not reach the network.', fix: 'Check your connection and the selected network, then try again.', technical };
  }
  return lang === 'id'
    ? { kind: 'unknown', name, reason: 'Transaksi ditolak oleh kontrak dengan alasan yang belum kami kenali.', fix: 'Periksa kembali isian Anda lalu coba lagi. Jika terus gagal, kirim detail teknis di bawah ke admin.', technical }
    : { kind: 'unknown', name, reason: 'The contract rejected the transaction for a reason we do not recognise yet.', fix: 'Double-check your inputs and try again. If it keeps failing, send the technical detail below to an admin.', technical };
}
