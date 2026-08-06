declare module '@mapbox/polyline' {
  const polyline: {
    encode(points: number[][]): string;
  };

  export default polyline;
}

declare module 'nodemailer' {
  type SendMailResult = {
    messageId: string;
    accepted: string[];
    rejected: string[];
    response: string;
    message?: Buffer;
  };

  type Transporter = {
    sendMail(options: Record<string, unknown>): Promise<SendMailResult>;
  };

  const nodemailer: {
    createTransport(options: Record<string, unknown>): Transporter;
  };

  export default nodemailer;
}
