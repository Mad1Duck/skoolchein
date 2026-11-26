import { useState, useEffect } from 'react';
import { useReadContracts } from 'wagmi';
import { scholarshipPriceOracleAbi } from '@/constants/contractsV4';
import {
  useOracle,
  useOracleTokens,
  useOracleMaxPriceAge,
  useRegisterToken,
  useDeregisterToken,
  useSetTokenPrice,
  useSetMaxPriceAge,
  formatUsdPrice,
} from '@/lib/contracts/v4';
import { NATIVE_TOKEN } from '@/lib/contracts/v4/token';
import { NeoCard, NeoCardBody } from '@/components/ui/NeoCard';
import { NeoButton } from '@/components/ui/NeoButton';
import { useT } from '@/lib/i18n';

type TokenRow = {
  address: `0x${string}`;
  symbol: string;
  decimals: number;
  priceUsd: bigint;
  updatedAt: bigint;
};

/**
 * Admin panel for the payment-token registry and USD exchange rates.
 *
 * Rates are display-only: no fund-moving contract reads them (see the scope
 * note in ScholarshipPriceOracle.sol). Registering a token here also does NOT
 * let it back a program — that whitelist is ScholarshipCore.setTokenConfig,
 * surfaced separately below.
 */
export function AdminTokenOracle() {
  const { t, tr } = useT();
  const { chainId, address: oracleAddress, isDeployed: isOracleDeployed } = useOracle();
  const { data: tokenAddresses, refetch: refetchTokens } = useOracleTokens();
  const { data: maxPriceAge, refetch: refetchMaxAge } = useOracleMaxPriceAge();

  const addresses = (tokenAddresses as `0x${string}`[] | undefined) ?? [];

  // Fan out one `tokens(address)` read per registered token.
  const { data: tokenInfos, refetch: refetchInfos } = useReadContracts({
    contracts: addresses.map((addr) => ({
      chainId,
      address: oracleAddress,
      abi: scholarshipPriceOracleAbi,
      functionName: 'tokens' as const,
      args: [addr] as const,
    })),
    query: { enabled: isOracleDeployed && addresses.length > 0 },
  });

  const rows: TokenRow[] = addresses.map((address, i) => {
    // tokens() returns a tuple: [registered, symbol, decimals, priceUsd, updatedAt]
    const raw = tokenInfos?.[i]?.result as
      | readonly [boolean, string, number, bigint, bigint]
      | undefined;
    return {
      address,
      symbol: raw?.[1] ?? '—',
      decimals: Number(raw?.[2] ?? 0),
      priceUsd: raw?.[3] ?? 0n,
      updatedAt: raw?.[4] ?? 0n,
    };
  });

  const { registerToken, isPending: isRegistering, isSuccess: registered } = useRegisterToken();
  const { deregisterToken, isPending: isDeregistering, isSuccess: deregistered } = useDeregisterToken();
  const { setPrice, isPending: isSettingPrice, isSuccess: pricePosted } = useSetTokenPrice();
  const { setMaxPriceAge, isPending: isSettingAge, isSuccess: agePosted } = useSetMaxPriceAge();

  const [newToken, setNewToken] = useState({ address: '', symbol: '', decimals: '18' });
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [ageDraft, setAgeDraft] = useState('');

  useEffect(() => {
    if (registered || deregistered) refetchTokens();
    if (pricePosted) refetchInfos();
    if (agePosted) refetchMaxAge();
  }, [registered, deregistered, pricePosted, agePosted, refetchTokens, refetchInfos, refetchMaxAge]);

  if (!isOracleDeployed) {
    return (
      <NeoCard>
        <NeoCardBody>
          <h3 className="font-paytone text-xl mb-2">{t('admin.oracle.title')}</h3>
          <div className="bg-skyellow-light border-2 border-black p-4 text-sm shadow-[3px_3px_0_0_#000]">
            <p className="font-bold mb-1">{t('admin.oracle.missing')}</p>
            <p className="text-gray-700 text-xs leading-relaxed">
              {tr('admin.oracle.missingBody')}
            </p>
          </div>
        </NeoCardBody>
      </NeoCard>
    );
  }

  const isStale = (updatedAt: bigint) => {
    if (updatedAt === 0n) return true;
    const age = BigInt(Math.floor(Date.now() / 1000)) - updatedAt;
    return age > (maxPriceAge as bigint ?? 0n);
  };

  return (
    <NeoCard>
      <NeoCardBody className="space-y-6">
        <div>
          <h3 className="font-paytone text-xl">{t('admin.oracle.title')}</h3>
          <p className="text-xs text-gray-600 mt-1">
            {tr('admin.oracle.intro')}
          </p>
        </div>

        {/* ── Registered tokens + rates ─────────────────────────────────── */}
        <div>
          <h4 className="text-xs font-extrabold uppercase tracking-widest mb-2">
            {t('admin.oracle.registered')}
          </h4>
          {rows.length === 0 ? (
            <p className="text-sm text-gray-500 italic">{t('admin.oracle.none')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-2 border-black">
                <thead className="bg-gray-100 border-b-2 border-black">
                  <tr>
                    <th className="p-2 text-left border-r-2 border-black">{t('admin.oracle.symbol')}</th>
                    <th className="p-2 text-left border-r-2 border-black">{t('admin.oracle.address')}</th>
                    <th className="p-2 text-right border-r-2 border-black">{t('admin.oracle.dec')}</th>
                    <th className="p-2 text-right border-r-2 border-black">{t('admin.oracle.price')}</th>
                    <th className="p-2 text-left border-r-2 border-black">{t('admin.oracle.newRate')}</th>
                    <th className="p-2 text-left">{t('admin.oracle.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.address} className="border-b border-gray-200">
                      <td className="p-2 font-bold border-r-2 border-black">
                        {row.symbol}
                        {row.address.toLowerCase() === NATIVE_TOKEN && (
                          <span className="ml-1 text-[10px] text-gray-500">({t('admin.oracle.native')})</span>
                        )}
                      </td>
                      <td className="p-2 font-data text-xs border-r-2 border-black">
                        {row.address.slice(0, 10)}…{row.address.slice(-6)}
                      </td>
                      <td className="p-2 text-right font-data border-r-2 border-black">
                        {row.decimals}
                      </td>
                      <td className="p-2 text-right font-data border-r-2 border-black">
                        ${formatUsdPrice(row.priceUsd)}
                        {isStale(row.updatedAt) && (
                          <span className="block text-[10px] text-skred font-bold">{t('admin.oracle.stale')}</span>
                        )}
                      </td>
                      <td className="p-2 border-r-2 border-black">
                        <input
                          type="number"
                          step="any"
                          placeholder="3000.50"
                          className="w-28 border-2 border-black p-1 text-xs"
                          value={priceDrafts[row.address] ?? ''}
                          onChange={(e) =>
                            setPriceDrafts({ ...priceDrafts, [row.address]: e.target.value })
                          }
                        />
                      </td>
                      <td className="p-2 space-x-1 whitespace-nowrap">
                        <NeoButton
                          label={t('admin.oracle.set')}
                          variant="primary"
                          disabled={!priceDrafts[row.address] || isSettingPrice}
                          onClick={() => setPrice(row.address, priceDrafts[row.address]!)}
                        />
                        <NeoButton
                          label={t('admin.oracle.remove')}
                          variant="ghost"
                          disabled={isDeregistering}
                          onClick={() => deregisterToken(row.address)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Register a new token ──────────────────────────────────────── */}
        <div className="border-t-2 border-gray-100 pt-4">
          <h4 className="text-xs font-extrabold uppercase tracking-widest mb-2">
            {t('admin.oracle.register')}
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
            <div className="col-span-2">
              <label className="block text-[10px] font-bold mb-1">{t('admin.oracle.address')}</label>
              <input
                type="text"
                placeholder={t('admin.oracle.addressHint')}
                className="w-full border-2 border-black p-2 font-data text-xs"
                value={newToken.address}
                onChange={(e) => setNewToken({ ...newToken, address: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold mb-1">{t('admin.oracle.symbol')}</label>
              <input
                type="text"
                placeholder="ETH"
                className="w-full border-2 border-black p-2 text-xs"
                value={newToken.symbol}
                onChange={(e) => setNewToken({ ...newToken, symbol: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold mb-1">{t('admin.oracle.decimals')}</label>
              <input
                type="number"
                min="0"
                max="36"
                className="w-full border-2 border-black p-2 text-xs"
                value={newToken.decimals}
                onChange={(e) => setNewToken({ ...newToken, decimals: e.target.value })}
              />
            </div>
          </div>
          <p className="text-[10px] text-gray-500 mt-1">
            {t('admin.oracle.decimalsHelp')}
          </p>
          <div className="mt-2">
            <NeoButton
              label={isRegistering ? t('common.processing') : t('admin.oracle.register')}
              variant="success"
              loading={isRegistering}
              disabled={!newToken.address || !newToken.symbol || isRegistering}
              onClick={() =>
                registerToken(
                  newToken.address as `0x${string}`,
                  newToken.symbol,
                  Number(newToken.decimals),
                )
              }
            />
          </div>
        </div>

        {/* ── Staleness threshold ───────────────────────────────────────── */}
        <div className="border-t-2 border-gray-100 pt-4">
          <h4 className="text-xs font-extrabold uppercase tracking-widest mb-2">
            {t('admin.oracle.age')}
          </h4>
          <p className="text-[10px] text-gray-500 mb-2">
            {t('admin.oracle.ageHelp', { seconds: maxPriceAge !== undefined ? Number(maxPriceAge as bigint) : '—' })}
          </p>
          <div className="flex gap-2 items-end">
            <input
              type="number"
              min="0"
              placeholder="86400"
              className="w-40 border-2 border-black p-2 text-xs"
              value={ageDraft}
              onChange={(e) => setAgeDraft(e.target.value)}
            />
            <NeoButton
              label={isSettingAge ? t('common.processing') : t('admin.oracle.update')}
              variant="primary"
              loading={isSettingAge}
              disabled={!ageDraft || isSettingAge}
              onClick={() => setMaxPriceAge(Number(ageDraft))}
            />
          </div>
        </div>
      </NeoCardBody>
    </NeoCard>
  );
}
