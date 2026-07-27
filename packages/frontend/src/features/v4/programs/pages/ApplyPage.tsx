import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useProgram } from '@/lib/api/hooks';
import { fetchProgramMeta, uploadToIPFS } from '@/lib/ipfs';
import { useApplyProgram } from '@/lib/contracts/write-hooks';
import { useAccount } from 'wagmi';
import { NeoButton } from '@/components/ui/NeoButton';
import { NeoCard, NeoCardBody } from '@/components/ui/NeoCard';
import { NeoSkeleton } from '@/components/ui/NeoSkeleton';

export function ApplyPage() {
  const { id } = useParams({ from: '/apply/$id' });
  const navigate = useNavigate();
  const { data: program, isLoading } = useProgram(id);
  const { data: meta } = useQuery({
    queryKey: ['ipfs-meta', program?.metadataCID],
    queryFn: () => fetchProgramMeta(program!.metadataCID),
    enabled: !!program?.metadataCID,
  });

  const { apply, isPending: isApplying, isSuccess: applied } = useApplyProgram();
  const { address: applicantAddress } = useAccount();

  const [step, setStep] = useState<'form' | 'uploading' | 'tx'>('form');
  const [formData, setFormData] = useState({
    profileText: '',
    essayText: '',
    documentText: '',
    recommendText: '',
    academicScore: 85,
    incomeScore: 90,
    recommendScore: 80,
    hackquestId: '',
  });

  useEffect(() => {
    if (applied) {
      navigate({ to: `/programs/${id}` });
    }
  }, [applied, id, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStep('uploading');

    try {
      const suffix = `${applicantAddress ?? 'anonymous'}-${Date.now()}`;
      // Mock uploading parts to IPFS
      const pRes = await uploadToIPFS({
        meta: {
          content: formData.profileText,
          hackquestId: formData.hackquestId, // Link student identity
        },
        type: 'application-profile',
        name: `profile-${suffix}`,
      });
      const eRes = await uploadToIPFS({ meta: { content: formData.essayText }, type: 'application-essay', name: `essay-${suffix}` });
      const dRes = await uploadToIPFS({ meta: { content: formData.documentText }, type: 'application-doc', name: `document-${suffix}` });
      const rRes = await uploadToIPFS({ meta: { content: formData.recommendText }, type: 'application-recommend', name: `recommendation-${suffix}` });

      const profileCID = pRes?.metaCID || 'QmProfileFallback123';
      const essayCID = eRes?.metaCID || 'QmEssayFallback123';
      const documentCID = dRes?.metaCID || 'QmDocFallback123';
      const recommendCID = rRes?.metaCID || 'QmRecommendFallback123';

      setStep('tx');

      apply({
        pid: BigInt(program?.pid ?? 0),
        profileCID,
        documentCID,
        essayCID,
        recommendCID,
        academicScore: BigInt(formData.academicScore),
        incomeScore: BigInt(formData.incomeScore),
        recommendScore: BigInt(formData.recommendScore),
      });
    } catch (err) {
      console.error(err);
      setStep('form');
    }
  };

  if (isLoading)
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-10 md:py-14">
        <NeoSkeleton lines={5} />
      </div>
    );
  if (!program)
    return (
      <div className="max-w-2xl mx-auto px-4 md:px-6 py-24 text-center">
        <div className="bg-white border-2 border-black shadow-[4px_4px_0_0_#000] rounded-lg p-10 inline-block">
          <h2 className="font-paytone text-3xl mb-3">Program Not Found</h2>
          <p className="text-gray-600 mb-6">The program you are trying to apply to does not exist.</p>
          <Link to="/programs">
            <NeoButton label="Back to Programs" variant="secondary" size="md" />
          </Link>
        </div>
      </div>
    );

  return (
    <main className="min-h-screen bg-skyellow relative isolate">
      <div
        className="absolute top-0 right-0 left-0 h-[40vh] bg-skpink"
        style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 88%, 0 100%)' }}
      />
      <div className="relative z-10 max-w-3xl mx-auto px-4 md:px-8 py-10 md:py-14">
        <div className="mb-8 text-center md:text-left">
          <Link
            to={`/programs/$id`}
            params={{ id }}
            className="text-black font-bold text-sm hover:underline inline-block mb-3"
          >
            ← Back to Program
          </Link>
          <h1 className="font-paytone text-4xl md:text-5xl mt-4 leading-[0.95] text-black drop-shadow-[3px_3px_0_#fff]">
            Apply for Scholarship
          </h1>
          <p className="text-black/70 text-lg md:text-xl mt-2 font-medium">
            {meta?.name ?? `Program #${id}`}
          </p>
        </div>

      <NeoCard fill="cream">
        <NeoCardBody>
          {step === 'uploading' && (
            <div className="text-center py-16">
              <div className="w-12 h-12 border-2 border-black bg-skyellow mx-auto animate-pulse mb-4 shadow-[3px_3px_0_0_#000]" />
              <p className="font-paytone text-xl">Uploading to IPFS</p>
              <p className="text-gray-500 text-sm mt-1">Encrypting and pinning your documents...</p>
            </div>
          )}

          {step === 'tx' && (
            <div className="text-center py-16">
              <div className="w-12 h-12 border-2 border-black bg-skpurple mx-auto animate-pulse mb-4 shadow-[3px_3px_0_0_#000]" />
              <p className="font-paytone text-xl">Confirm in Wallet</p>
              <p className="text-gray-500 text-sm mt-1">Sign the smart contract interaction to submit.</p>
            </div>
          )}

          {step === 'form' && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="bg-skyellow-light p-5 border-2 border-black shadow-[3px_3px_0_0_#000]">
                <h3 className="font-paytone text-lg mb-4">Documents</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-extrabold uppercase tracking-widest mb-1.5">Profile / Bio</label>
                    <textarea
                      required
                      className="w-full"
                      rows={2}
                      value={formData.profileText}
                      onChange={(e) => setFormData((p) => ({ ...p, profileText: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold uppercase tracking-widest mb-1.5">
                      HackQuest ID <span className="text-gray-500 font-normal normal-case tracking-normal">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="user@example.com"
                      className="w-full"
                      value={formData.hackquestId}
                      onChange={(e) => setFormData((p) => ({ ...p, hackquestId: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold uppercase tracking-widest mb-1.5">Essay Answers</label>
                    <textarea
                      required
                      className="w-full"
                      rows={3}
                      value={formData.essayText}
                      onChange={(e) => setFormData((p) => ({ ...p, essayText: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <div className="bg-skpurple-light p-5 border-2 border-black shadow-[3px_3px_0_0_#000]">
                <h3 className="font-paytone text-lg mb-3">Self-Declared Scores</h3>
                <p className="text-xs text-gray-700 mb-5 bg-white p-3 border-2 border-black">
                  <span className="font-extrabold uppercase tracking-wider">Warning:</span> Your scores will be stored on-chain. If anyone spots a false claim, your deposit might be slashed and your application rejected. Be honest.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest mb-1.5">Academic (0-100)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      required
                      className="w-full"
                      value={formData.academicScore}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, academicScore: Number(e.target.value) }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest mb-1.5">Income Need</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      required
                      className="w-full"
                      value={formData.incomeScore}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, incomeScore: Number(e.target.value) }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest mb-1.5">Recommendation</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      required
                      className="w-full"
                      value={formData.recommendScore}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, recommendScore: Number(e.target.value) }))
                      }
                    />
                  </div>
                </div>
              </div>

              <NeoButton
                type="submit"
                label={isApplying ? 'Applying...' : 'Submit Application'}
                variant="primary"
                size="lg"
                fullWidth
                disabled={isApplying}
                loading={isApplying}
              />
            </form>
          )}
        </NeoCardBody>
      </NeoCard>
      </div>
    </main>
  );
}
