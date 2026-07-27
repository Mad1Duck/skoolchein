import { create } from 'ipfs-http-client';
import { PinataSDK } from 'pinata';

export const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT,
  pinataGateway: process.env.PINATA_GATEWAY,
});

export const ipfsPinataGateway = `https://${process.env.PINATA_GATEWAY}/ipfs`;

export const ipfs = create({
  host: process.env.IPFS_HOST,
  port: 5001,
  protocol: 'http'
});

export const ipfsHost = "https://camping-programmes-annex-gorgeous.trycloudflare.com/ipfs";
