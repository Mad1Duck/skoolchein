import { Injectable, Singleton } from "hono-forge";
import { getPinata, getPinataGateway } from "@/utils/lib/ipfs";
import { BADGE_THEME, renderBadgePng, type BadgeInput } from "./badge";

export interface IMetadata {
  [key: string]: unknown;
}

async function uploadFile(file: File): Promise<string> {
  const result = await getPinata().upload.public.file(file);
  return result.cid;
}

async function uploadJson(data: object): Promise<string> {
  const json = JSON.stringify(data);
  const rawName = (data as Record<string, unknown>).name;
  const fileName = typeof rawName === "string" && rawName.length > 0
    ? `${rawName.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`
    : 'metadata.json';

  const file = new File([json], fileName, { type: 'application/json' });
  const result = await getPinata().upload.public.file(file);
  return result.cid;
}

@Injectable()
@Singleton()
export class IpfsService {
  async uploadToIPFS(file: File, metadata: IMetadata) {
    const gateway = getPinataGateway();
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

  /** Draw a credential's picture, pin it, and pin the NFT metadata that points at it. */
  async uploadBadge(input: BadgeInput) {
    const theme = BADGE_THEME[input.kind];
    const name = `skoolchein_badge_${input.kind}_${input.pid}_${input.wallet.slice(2, 8).toLowerCase()}`;
    const imageCID = await uploadFile(new File([renderBadgePng(input)], `${name}.png`, { type: "image/png" }));
    const metadata = {
      name: `${theme.title} #${input.pid}`,
      description:
        input.kind === "student"
          ? `Credential for completing the scholarship program "${input.programName}".`
          : `Proof of donating to the scholarship program "${input.programName}".`,
      image: `ipfs://${imageCID}`,
      attributes: [
        { trait_type: "Program", value: input.programName },
        { trait_type: "Program ID", value: input.pid },
        { trait_type: "Role", value: theme.tag },
        { display_type: "date", trait_type: "Issued", value: Math.floor(input.date.getTime() / 1000) },
      ],
    };
    const metaCID = await uploadJson(metadata);
    return { imageCID, metaCID, imageURL: `${getPinataGateway()}/${imageCID}` };
  }

  async uploadERCToIPFS(file: File, metadata: IMetadata) {
    const gateway = getPinataGateway();
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
}
