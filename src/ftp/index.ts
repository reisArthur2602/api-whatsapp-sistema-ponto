import "dotenv/config";

import * as ftp from "basic-ftp";

export const createFtpClient = async (path?: string, isFTPS?: boolean) => {
  const host = process.env.FTP_HOST as string;
  const user = process.env.FTP_USER as string;
  const password = (process.env.FTP_PASSWORD as string) || "";

  const client = new ftp.Client();
  await client.access({
    host,
    user,
    password,
    secure: isFTPS || false,
  });
  await client.cd(path || "/media");
  return client;
};
