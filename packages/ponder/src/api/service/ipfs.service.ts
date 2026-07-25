import { ipfs, ipfsHost, ipfsPinataGateway, pinata } from '@/utils/lib/ipfs';
import { IMetadata } from '../types/metadata.type';


const usePinata = !!process.env.PINATA_JWT;

function getGateway() {
  if (usePinata) return ipfsPinataGateway;
  return ipfsHost;
}

async function uploadFile(file: File): Promise<string> {
  if (usePinata) {
    const result = await pinata.upload.public.file(file);
    return result.cid;
  } else {
    const buffer = await file.arrayBuffer();
    const result = await ipfs.add(Buffer.from(buffer), { pin: true });
    return result.cid.toString();
  }
}

async function uploadJson(data: object): Promise<string> {
  const json = JSON.stringify(data);
  const rawName = (data as Record<string, unknown>).name;
  const fileName = typeof rawName === "string" && rawName.length > 0
    ? `${rawName.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`
    : 'metadata.json';

  if (usePinata) {
    const file = new File([json], fileName, { type: 'application/json' });
    const result = await pinata.upload.public.file(file);
    return result.cid;
  } else {
    const result = await ipfs.add(json, { pin: true });
    return result.cid.toString();
  }
}

export async function uploadToIPFS(file: File, metadata: IMetadata) {
  const gateway = getGateway();
  let imageCID: string | undefined;

  if (file) {
    imageCID = await uploadFile(file);
  }

  const finalMeta = {
    ...metadata,
    image: imageCID ? `ipfs://${imageCID}` : '',
  };

  const metaCID = await uploadJson(finalMeta);

  return {
    imageCID,
    metaCID,
    metadataURL: `${gateway}/${metaCID}`,
    imageURL: imageCID ? `${gateway}/${imageCID}` : '',
  };
}

export async function uploadERCToIPFS(file: File, metadata: IMetadata) {
  const gateway = getGateway();
  let imageCID = '';
  let imageURL = '';

  if (file) {
    imageCID = await uploadFile(file);
    imageURL = `${gateway}/${imageCID}`;
  }

  const finalMeta = {
    name: metadata.name || 'Untitled',
    description: metadata.description || '',
    external_url: metadata.external_url || '',
    image: imageURL,
    attributes: Array.isArray(metadata.attributes) ? metadata.attributes : [],
  };

  const metaCID = await uploadJson(finalMeta);

  return {
    imageCID,
    metaCID,
    metadataURL: `${gateway}/${metaCID}`,
    imageURL,
    ipfsFormat: finalMeta,
  };
}