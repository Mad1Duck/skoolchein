import { Injectable, Singleton } from "hono-forge";
import { ipfsPinataGateway, pinata } from "@/utils/lib/ipfs";

export interface IMetadata {
  [key: string]: unknown;
}

async function uploadFile(file: File): Promise<string> {
  const result = await pinata.upload.public.file(file);
  return result.cid;
}

async function uploadJson(data: object): Promise<string> {
  const json = JSON.stringify(data);
  const rawName = (data as Record<string, unknown>).name;
  const fileName = typeof rawName === "string" && rawName.length > 0
    ? `${rawName.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`
    : 'metadata.json';

  const file = new File([json], fileName, { type: 'application/json' });
  const result = await pinata.upload.public.file(file);
  return result.cid;
}

@Injectable()
@Singleton()
export class IpfsService {
  async uploadToIPFS(file: File, metadata: IMetadata) {
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
      metadataURL: `${ipfsPinataGateway}/${metaCID}`,
      imageURL: imageCID ? `${ipfsPinataGateway}/${imageCID}` : '',
    };
  }

  async uploadERCToIPFS(file: File, metadata: IMetadata) {
    let imageCID = '';
    let imageURL = '';

    if (file) {
      imageCID = await uploadFile(file);
      imageURL = `${ipfsPinataGateway}/${imageCID}`;
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
      metadataURL: `${ipfsPinataGateway}/${metaCID}`,
      imageURL,
      ipfsFormat: finalMeta,
    };
  }
}
