import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const accessKeyId = process.env.SES_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.SES_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY;
const region = process.env.AWS_SES_REGION ?? process.env.AWS_REGION ?? "us-west-2";
const from = process.env.SES_FROM_EMAIL;
const to = process.env.SES_TEST_TO ?? from;

if (!accessKeyId || !secretAccessKey) {
  console.error(
    "Missing SES_ACCESS_KEY_ID / SES_SECRET_ACCESS_KEY (or AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY).",
  );
  process.exit(1);
}

if (!from) {
  console.error("Missing SES_FROM_EMAIL.");
  process.exit(1);
}

const client = new SESClient({
  region,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

const params = {
  Source: `ISGE 360 <${from}>`,
  Destination: {
    ToAddresses: [to],
  },
  Message: {
    Subject: { Data: "Test Email from ISGE 360", Charset: "UTF-8" },
    Body: { Text: { Data: "This is a test email from AWS SES integration.", Charset: "UTF-8" } },
  },
};

try {
  const command = new SendEmailCommand(params);
  const response = await client.send(command);
  console.log("Email sent successfully.");
  console.log("Message ID:", response.MessageId);
} catch (error) {
  console.error("Error sending email:", error instanceof Error ? error.message : error);
  process.exit(1);
}
