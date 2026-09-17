Senior Design Lab 1

This is a project meant to display temperature reading on a website from 2 sensors. 

## EmailJS setup

1. Create an account at https://www.emailjs.com/.
2. Add an email service.
3. Create an email template with these variables:
	- `{{to_email}}` for the recipient email
	- `{{subject}}` for the subject
	- `{{message}}` for the alert text
4. Copy the Public Key and Service ID into `script.js`. Replace `YOUR_EMAILJS_TEMPLATE_ID` with the Template ID created in EmailJS, which looks like `template_abc123`.
5. Open `index.html` in a browser, enable notifications, enter an email, and save the alert settings.

The message is sent when a sensor crosses the configured maximum or minimum temperature. EmailJS uses a public browser key, so do not put a private server API key in this project.
