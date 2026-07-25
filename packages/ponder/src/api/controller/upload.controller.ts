import { Context } from "hono";
import { uploadERCToIPFS, uploadToIPFS } from "../service/ipfs.service";
import { isArray, isObject } from "lodash";

export const uploadController = async (c: Context) => {
  // Support both JSON body (no-file metadata uploads) and multipart (with file)
  const ct = c.req.header("content-type") ?? "";
  let body: Record<string, any>;
  if (ct.includes("application/json")) {
    const raw = await c.req.json();
    // Flatten: { meta: { name, description, ... }, type } → { name, description, ..., type }
    body = typeof raw?.meta === "object" && raw.meta !== null
      ? { ...raw.meta, type: raw.type }
      : raw ?? {};
  } else {
    body = await c.req.parseBody();
  }

  const file = body.file instanceof File ? body.file : undefined;

  // Parse attributes only from body.attributes, not the entire body
  let parsedAttributes: Record<string, any>[] = [];
  const rawAttributes = body.attributes;
  if (typeof rawAttributes === "string") {
    try {
      const parsed = JSON.parse(rawAttributes);
      parsedAttributes = isArray(parsed) ? parsed : isObject(parsed) ? [parsed] : [];
    } catch { /* ignore malformed JSON */ }
  } else if (isArray(rawAttributes)) {
    parsedAttributes = rawAttributes;
  } else if (isObject(rawAttributes) && rawAttributes !== null) {
    parsedAttributes = [rawAttributes as Record<string, any>];
  }

  const type = typeof body.type === "string" ? body.type : "metadata";
  const rawName = typeof body.name === "string"
    ? body.name
    : `untitled-${Date.now()}`;

  // Enforce Skoolchein naming convention: skoolchein_<feature>_<uniqname>
  const finalName = rawName.startsWith("skoolchein_")
    ? rawName
    : `skoolchein_${type}_${rawName}`;

  const metadata = {
    name:        finalName,
    description: typeof body.description === "string" ? body.description : "",
    attributes:  parsedAttributes,
  };

  const result = await uploadToIPFS(file as File, metadata);
  return c.json(result);
};


export const uploadERC721Controller = async (c: Context) => {
  const body = await c.req.parseBody();
  const file = body.file as File;

  if (!(file instanceof File)) {
    return c.json({ error: "File is required and must be a valid image." }, 400);
  }

  const rawName = typeof body.name === "string"
    ? body.name
    : `untitled-${Date.now()}`;

  // Enforce Skoolchein naming convention for NFTs: skoolchein_nft_<uniqname>
  const nftName = rawName.startsWith("skoolchein_")
    ? rawName
    : `skoolchein_nft_${rawName}`;

  const name = typeof body.name === "string" ? body.name : "Untitled NFT";
  const description = typeof body.description === "string" ? body.description : "";
  const external_url = typeof body.external_url === "string" ? body.external_url : "";
  const imageURL = typeof body.image === "string" ? body.image : "";

  // Parse attributes from body
  let parsedAttributes: any[] = [];
  const attributesRaw = body.attributes;
  try {
    if (typeof attributesRaw === "string") {
      const parsed = JSON.parse(attributesRaw);
      parsedAttributes = isArray(parsed) ? parsed : isObject(parsed) ? [parsed] : [];
    } else if (isArray(attributesRaw)) {
      parsedAttributes = attributesRaw;
    } else if (isObject(attributesRaw)) {
      parsedAttributes = [attributesRaw];
    }
  } catch (e) {
    return c.json({ error: "Invalid JSON for attributes." }, 400);
  }

  const metadata = {
    name,
    description,
    external_url,
    image: imageURL,
    attributes: parsedAttributes,
  };

  const result = await uploadERCToIPFS(file, metadata);
  return c.json(result);
};
