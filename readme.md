# Teamup Webhook Handler

A webhook handler for automatically adding Zoom links to Teamup calendar events based on their sub-calendar.

## Features

- Receives webhooks from Teamup calendar
- Detects event creation and updates
- Adds custom Zoom links based on which sub-calendar is used
- Lightweight and deployable to serverless platforms

## Setup

### Prerequisites

- Node.js 14+
- Teamup Calendar with API access
- Zoom links for each sub-calendar

### Installation

1. Clone this repository
```bash
git clone https://github.com/your-username/teamup-webhook-handler.git
cd teamup-webhook-handler
```

2. Install dependencies
```bash
npm install
```

3. Create a `.env` file based on `.env.example`
```bash
cp .env.example .env
```

4. Add your Teamup API key and Calendar ID to the `.env` file

5. Configure your sub-calendar Zoom links in `webhook-handler.js`

### Local Development

Run the server locally:
```bash
npm run dev
```

The server will start on port 3000 (or the port specified in your `.env` file).

## Deployment

### Deploying to Vercel

1. Install Vercel CLI (optional)
```bash
npm install -g vercel
```

2. Deploy
```bash
vercel
```

Alternatively, connect your GitHub repository to Vercel and deploy through their web interface.

3. Set environment variables in the Vercel dashboard:
   - `TEAMUP_API_KEY`
   - `CALENDAR_ID`

4. Your webhook URL will be: `https://your-project.vercel.app/webhook`

### Configure Teamup Webhook

Add your deployment URL to your Teamup calendar webhook settings.

## Customization

Edit the `SUB_CALENDAR_ZOOM_LINKS` object in `webhook-handler.js` to map your sub-calendar IDs to their corresponding Zoom links.

## License

[MIT](LICENSE)
