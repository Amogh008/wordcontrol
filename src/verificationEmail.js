const nodemailer = require('nodemailer');
const dns = require('node:dns').promises;
const net = require('node:net');

let transporterPromise;

async function mailTransporter() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_APP_PASSWORD;
  if (!user || !pass) {
    const error = new Error('Email verification is not configured.');
    error.statusCode = 503;
    throw error;
  }

  if (!transporterPromise) {
    transporterPromise = (async () => {
      const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
      // Nodemailer 9 resolves all A and AAAA records and may randomly choose
      // IPv6 even when Render has no IPv6 route. Supplying an A record as the
      // connection host prevents that, while servername keeps TLS validation
      // tied to smtp.gmail.com instead of the resolved address.
      const smtpAddress = net.isIP(smtpHost) ? smtpHost : (await dns.resolve4(smtpHost))[0];
      return nodemailer.createTransport({
        host: smtpAddress,
        port: Number(process.env.SMTP_PORT || 465),
        secure: String(process.env.SMTP_SECURE || 'true').toLowerCase() !== 'false',
        tls: { servername: net.isIP(smtpHost) ? undefined : smtpHost },
        connectionTimeout: 10 * 1000,
        greetingTimeout: 10 * 1000,
        socketTimeout: 20 * 1000,
        auth: { user, pass: pass.replace(/\s+/g, '') },
      });
    })();
  }
  return transporterPromise;
}

async function sendVerificationEmail(email, code) {
  const user = process.env.SMTP_USER;
  const from = process.env.VERIFICATION_EMAIL_FROM || `DLT <${user}>`;

  try {
    const mailer = await mailTransporter();
    await mailer.sendMail({
      from,
      to: email,
      subject: 'Your DLT verification code',
      text: `Your DLT verification code is ${code}. It expires in 10 minutes.`,
      html: [
        '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#211d19">',
        '<h1 style="font-family:Georgia,serif">Verify your DLT email</h1>',
        '<p>Enter this code in DLT (Deutsche Learn Tool) to finish creating your account:</p>',
        `<p style="font-size:32px;font-weight:700;letter-spacing:8px">${code}</p>`,
        '<p>This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>',
        '</div>',
      ].join(''),
    });
  } catch (err) {
    if (err.statusCode) throw err;
    console.error('Verification email delivery failed:', err.message);
    const deliveryError = new Error(
      'The verification email could not be sent. Please try again.',
    );
    deliveryError.statusCode = 502;
    throw deliveryError;
  }
}

async function sendPasswordResetEmail(email, code) {
  const user = process.env.SMTP_USER;
  const from = process.env.VERIFICATION_EMAIL_FROM || `DLT <${user}>`;

  try {
    const mailer = await mailTransporter();
    await mailer.sendMail({
      from,
      to: email,
      subject: 'Reset your DLT password',
      text: `Your DLT password reset code is ${code}. It expires in 10 minutes.`,
      html: [
        '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#211d19">',
        '<h1 style="font-family:Georgia,serif">Reset your DLT password</h1>',
        '<p>Enter this code in DLT to choose a new password:</p>',
        `<p style="font-size:32px;font-weight:700;letter-spacing:8px">${code}</p>`,
        '<p>This code expires in 10 minutes. If you did not request a password reset, you can ignore this email.</p>',
        '</div>',
      ].join(''),
    });
  } catch (err) {
    if (err.statusCode) throw err;
    console.error('Password reset email delivery failed:', err.message);
    const deliveryError = new Error(
      'The password reset email could not be sent. Please try again.',
    );
    deliveryError.statusCode = 502;
    throw deliveryError;
  }
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
