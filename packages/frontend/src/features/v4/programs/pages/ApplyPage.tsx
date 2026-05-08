import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useProgram } from '@/lib/api/hooks';
import { fetchProgramMeta, uploadToIPFS } from '@/lib/ipfs';
import { useApplyProgram } from '@/lib/contracts/write-hooks';
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
      // Mock uploading parts to IPFS
      const pRes = await uploadToIPFS({ 
        meta: { 
          content: formData.profileText,
          hackquestId: formData.hackquestId, // Link student identity
        }, 
        type: 'application-profile' 
      });
      const eRes = await uploadToIPFS({ meta: { content: formData.essayText }, type: 'application-essay' });
      const dRes = await uploadToIPFS({ meta: { content: formData.documentText }, type: 'application-doc' });
      const rRes = await uploadToIPFS({ meta: { content: formData.recommendText }, type: 'application-recommend' });

      const profileCID = pRes?.metaCID || 'QmProfileFallback123';
      const essayCID = eRes?.metaCID || 'QmEssayFallback123';
      const documentCID = dRes?.metaCID || 'QmDocFallback123';
      const recommendCID = rRes?.metaCID || 'QmRecommendFallback123';
      console.log(
        {
          programId: BigInt(program?.pid!),
          profileCID,
          documentCID,
          essayCID,
          recommendCID,
          selfDeclaredAcademicScore: BigInt(formData.academicScore),
          selfDeclaredIncomeScore: BigInt(formData.incomeScore),
          selfDeclaredRecommendScore: BigInt(formData.recommendScore),
        },
        '====ok=====',
      );

      setStep('tx');

      apply({
        programId: BigInt(program?.pid!),
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
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-10">
        <NeoSkeleton lines={5} />
      </div>
    );
  if (!program)
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-24 text-center">
        <h2 className="font-paytone text-2xl mb-2">Program Not Found</h2>
        <p className="text-gray-600 mb-4">The program you are trying to apply to does not exist.</p>
        <Link to="/programs" className="text-skpurple font-bold">Back to Programs</Link>
      </div>
    );

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-10">
      <div className="mb-6">
        <Link
          to={`/programs/$id`}
          params={{ id }}
          className="text-skpurple font-bold text-sm">
          Back to Program
        </Link>
        <h1 className="font-paytone text-3xl md:text-4xl mt-3 text-black">Apply for Scholarship</h1>
        <p className="text-gray-600 text-base md:text-lg">{meta?.name ?? `Program #${id}`}</p>
      </div>

      <NeoCard className="p-4 md:p-6">
        <NeoCardBody>
          {step === 'uploading' && (
            <div className="text-center py-16">
              <div className="w-12 h-12 border-2 border-black bg-skyellow mx-auto animate-pulse mb-4" />
              <p className="font-bold text-lg">Uploading Documents to IPFS</p>
            </div>
          )}

          {step === 'tx' && (
            <div className="text-center py-16">
              <div className="w-12 h-12 border-2 border-black bg-skpurple mx-auto animate-pulse mb-4" />
              <p className="font-bold text-lg">Confirm Transaction in Wallet</p>
              <p className="text-gray-500 text-sm">Sign the smart contract interaction to continue.</p>
            </div>
          )}

          {step === 'form' && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="bg-skyellow-light p-4 border-2 border-black shadow-[3px_3px_0_0_#000]">
                <h3 className="font-paytone text-lg mb-3">Documents</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold mb-1">Profile / Bio</label>
                    <textarea
                      required
                      className="w-full border-2 border-black p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                      rows={2}
                      value={formData.profileText}
                      onChange={(e) => setFormData((p) => ({ ...p, profileText: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-1">
                      HackQuest ID <span className="text-gray-500 text-xs font-normal">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="user@example.com"
                      className="w-full border-2 border-black p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                      value={formData.hackquestId}
                      onChange={(e) => setFormData((p) => ({ ...p, hackquestId: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-1">Essay Answers</label>
                    <textarea
                      required
                      className="w-full border-2 border-black p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                      rows={3}
                      value={formData.essayText}
                      onChange={(e) => setFormData((p) => ({ ...p, essayText: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <div className="bg-skpurple-light p-4 border-2 border-black shadow-[3px_3px_0_0_#000]">
                <h3 className="font-paytone text-lg mb-2">Self-Declared Scores</h3>
                <p className="text-xs text-gray-700 mb-4 bg-white p-2 border-2 border-black">
                  WARNING: Your scores will be stored on-chain. If anyone spots a false claim, your
                  deposit might be slashed and your application rejected. Be honest.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold mb-1">Academic (0-100)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      required
                      className="w-full border-2 border-black p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                      value={formData.academicScore}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, academicScore: Number(e.target.value) }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1">Income Need (0-100)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      required
                      className="w-full border-2 border-black p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                      value={formData.incomeScore}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, incomeScore: Number(e.target.value) }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1">Recommendation</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      required
                      className="w-full border-2 border-black p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
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
  );
}
