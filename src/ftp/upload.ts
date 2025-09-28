import { Readable } from "stream";
import { createFtpClient } from "./index.js";

export const uploadToFtp = async (
  buffer: Buffer,
  fileName: string,
  path: string
) => {
  const client = await createFtpClient(path);

  const publicBaseUrl = process.env.FTP_PATH_URL as string;

  try {
    const stream = Readable.from(buffer);
    await client.uploadFrom(stream, fileName);
    const relativePath = path.replace("/public_html", "").replace(/\/+$/, "");

    return `${publicBaseUrl}${relativePath}/${fileName}`;
  } catch (err) {
    console.error("Erro ao fazer upload FTP:", err);
    return null;
  } finally {
    client.close();
  }
};
