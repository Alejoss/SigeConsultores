import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
if (!accessKeyId || !secretAccessKey) {
  console.error(
    "Missing AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY in the environment.",
  );
  process.exit(1);
}

const client = new SESClient({
  region: process.env.AWS_REGION ?? "us-east-1",
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

const params = {
  Source: "e.roman@sigeconsultores.com",
  Destination: {
    ToAddresses: ["e.roman@sigeconsultores.com"],
  },
  Message: {
    Subject: { Data: "Test Email from SIGE" },
    Body: { Text: { Data: "This is a test email from AWS SES integration." } },
  },
};

try {
  const command = new SendEmailCommand(params);
  const response = await client.send(command);
  console.log("✅ Email sent successfully!");
  console.log("Message ID:", response.MessageId);
} catch (error) {
  console.error("❌ Error sending email:", error.message);
}
