const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.env.PORT || 3000);
const resendApiKey = process.env.RESEND_API_KEY;
const resendFromEmail = process.env.RESEND_FROM_EMAIL;
const publicDirectory = __dirname;

const contentTypes = {
    '.css': 'text/css',
    '.html': 'text/html',
    '.js': 'text/javascript'
};

function sendJson(response, statusCode, body) {
    response.writeHead(statusCode, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body));
}

function readRequestBody(request) {
    return new Promise((resolve, reject) => {
        let body = '';
        request.on('data', chunk => {
            body += chunk;
            if (body.length > 10000) {
                reject(new Error('Request body is too large.'));
                request.destroy();
            }
        });
        request.on('end', () => resolve(body));
        request.on('error', reject);
    });
}

async function sendEmail(request, response) {
    if (!resendApiKey || !resendFromEmail) {
        sendJson(response, 500, { error: 'Email service is not configured.' });
        return;
    }

    try {
        const body = JSON.parse(await readRequestBody(request));
        const email = typeof body.to === 'string' ? body.to.trim() : '';
        const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
        const message = typeof body.message === 'string' ? body.message.trim() : '';

        if (!/^\S+@\S+\.\S+$/.test(email) || !subject || !message) {
            sendJson(response, 400, { error: 'A valid recipient, subject, and message are required.' });
            return;
        }

        const resendResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: resendFromEmail,
                to: [email],
                subject,
                text: message
            })
        });

        const resendBody = await resendResponse.json();
        if (!resendResponse.ok) {
            sendJson(response, resendResponse.status, { error: 'Email provider rejected the request.', details: resendBody });
            return;
        }

        sendJson(response, 200, { success: true, id: resendBody.id });
    } catch (error) {
        sendJson(response, 400, { error: error.message });
    }
}

function serveFile(request, response) {
    const requestedPath = request.url === '/' ? '/index.html' : request.url;
    const filePath = path.resolve(publicDirectory, `.${requestedPath}`);

    if (!filePath.startsWith(`${publicDirectory}${path.sep}`)) {
        response.writeHead(403);
        response.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (error, file) => {
        if (error) {
            response.writeHead(404);
            response.end('Not found');
            return;
        }

        response.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath)] || 'text/plain' });
        response.end(file);
    });
}

const server = http.createServer((request, response) => {
    if (request.method === 'POST' && request.url === '/api/send-email') {
        sendEmail(request, response);
        return;
    }

    if (request.method === 'GET') {
        serveFile(request, response);
        return;
    }

    sendJson(response, 405, { error: 'Method not allowed.' });
});

server.listen(port, () => {
    console.log(`Temperature monitor running at http://localhost:${port}`);
});
