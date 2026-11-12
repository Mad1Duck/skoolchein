import type { Context } from "hono";
import { Controller, Post, Injectable, ApiTags, ApiDoc, HttpException } from "hono-forge";
import { isArray, isObject } from "lodash";
import { IpfsService } from "./ipfs.service";

@Controller("/ipfs")
@Injectable([IpfsService])
@ApiTags("IPFS")
export class IpfsController {
  constructor(private service: IpfsService) {}

  @Post("/upload")
  @ApiDoc({ summary: "Upload metadata/file to IPFS" })
  async upload(c: Context) {
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

    // Everything else the client sent (an application's `content`, `hackquestId`, a program's
    // `organization`, ...) belongs in the stored document. It used to be dropped here, so any text
    // sent as `content` was uploaded as an empty shell and could never be read back.
    const { file: _file, type: _type, name: _name, description: _description, attributes: _attributes, ...extra } = body;
    const passthrough = Object.fromEntries(
      Object.entries(extra).filter(([, v]) => typeof v !== "function" && !(v instanceof File)),
    );

    const metadata = {
      ...passthrough,
      name: finalName,
      description: typeof body.description === "string" ? body.description : "",
      attributes: parsedAttributes,
    };

    return this.service.uploadToIPFS(file as File, metadata);
  }

  @Post("/upload/erc-721")
  @ApiDoc({ summary: "Upload NFT-style metadata (with image) to IPFS" })
  async uploadERC721(c: Context) {
    const body = await c.req.parseBody();
    const file = body.file as File;

    if (!(file instanceof File)) {
      throw HttpException.badRequest("File is required and must be a valid image.");
    }

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
      throw HttpException.badRequest("Invalid JSON for attributes.");
    }

    const metadata = {
      name,
      description,
      external_url,
      image: imageURL,
      attributes: parsedAttributes,
    };

    return this.service.uploadERCToIPFS(file, metadata);
  }
}
