Senior Desing Lab 1

This is a project meant to display temperature reading on a website from 2 sensors. 

## Run the email-enabled site

1. Install Node.js 18 or newer.
2. Create a Resend account and verify the sender domain or email address.
3. Export the values from `.env.example` in your terminal, then start the server:

```sh
export RESEND_API_KEY="your_resend_key"
export RESEND_FROM_EMAIL="alerts@your-verified-domain.com"
npm start
```

Open `http://localhost:3000`. The email in the form is now the actual recipient. The API key stays on the server and is never sent to the browser.
