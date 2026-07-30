const RESEND_ENDPOINT = 'https://api.resend.com/emails';

async function sendVerificationEmail(email, code) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.VERIFICATION_EMAIL_FROM;
  if (!apiKey || !from) {
    const error = new Error('Email verification is not configured.');
    error.statusCode = 503;
    throw error;
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'Your Wordcontrol verification code',
      text: `Your Wordcontrol verification code is ${code}. It expires in 10 minutes.`,
      html: [
        '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#211d19">',
        '<h1 style="font-family:Georgia,serif">Verify your Wordcontrol email</h1>',
        '<p>Enter this code in Wordcontrol to finish creating your account:</p>',
        `<p style="font-size:32px;font-weight:700;letter-spacing:8px">${code}</p>`,
        '<p>This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>',
        '</div>',
      ].join(''),
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    console.error('Verification email delivery failed:', response.status, details);
    const error = new Error('The verification email could not be sent. Please try again.');
    error.statusCode = 502;
    throw error;
  }
}

module.exports = { sendVerificationEmail };
