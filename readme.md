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


# Environment Variables

Add the following variables to your `.env` file for configuration:

## Required Variables

- `TEAMUP_API_KEY` - Your Teamup API key for authentication
- `CALENDAR_ID` - The ID of your Teamup calendar

## Logging Configuration

- `ENABLE_LOGGING` - Controls whether logging is enabled
  - Set to `"true"` to enable logging (default)
  - Set to `"false"` to disable all logging

- `LOG_LEVEL` - Controls the verbosity of logs when enabled
  - `"error"` - Only log errors (least verbose)
  - `"warn"` - Log errors and warnings
  - `"info"` - Log errors, warnings, and general information (default)
  - `"debug"` - Log errors, warnings, info, and detailed debug information
  - `"trace"` - Log everything including highly detailed trace information (most verbose)

## Example `.env` file

```
# Required credentials
TEAMUP_API_KEY=k73jd92lsm56dn2k
CALENDAR_ID=ks73ndla9

# Logging configuration
ENABLE_LOGGING=true
LOG_LEVEL=info
```

## Setting Environment Variables on Vercel

To set environment variables on Vercel:

1. Go to your project on the Vercel dashboard
2. Click on "Settings"
3. Click on "Environment Variables"
4. Add each variable and its value
5. Deploy your application to apply the changes

## License

[MIT](LICENSE)
