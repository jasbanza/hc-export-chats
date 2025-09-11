# HelpCrunch Chat Export

Export all conversations from HelpCrunch to JSON format, optimized for AI training data.

## Features

- Export all conversations filtered by organization and date
- Fetch messages for each conversation using HelpCrunch REST API
- Consolidate messages into a single string per chat with USER/AGENT tags
- Rate limiting and error handling
- Configurable output format
- Progress tracking during export

## Installation

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy the environment file and configure your credentials:
   ```bash
   cp .env.example .env
   ```

4. Edit `.env` file with your HelpCrunch API credentials:
   ```
   HELPCRUNCH_API_KEY=your_api_key_here
   HELPCRUNCH_API_SECRET=your_api_secret_here
   HELPCRUNCH_ORGANIZATION_ID=your_organization_id_here
   FROM_DATE=2024-01-01
   OUTPUT_FILE=exported_chats.json
   ```

## Usage

### Basic Export
```bash
npm start
```

or

```bash
npm run export
```

### Direct Node.js execution
```bash
node index.js
```

## Configuration

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `HELPCRUNCH_API_KEY` | Your HelpCrunch API key | Required |
| `HELPCRUNCH_API_SECRET` | Your HelpCrunch API secret | Required |
| `HELPCRUNCH_ORGANIZATION_ID` | Your organization ID | Required |
| `FROM_DATE` | Start date for conversation export (YYYY-MM-DD) | `2024-01-01` |
| `OUTPUT_FILE` | Output JSON file path | `exported_chats.json` |

## API Credentials

To get your HelpCrunch API credentials:

1. Log in to your HelpCrunch account
2. Go to Settings > API
3. Create a new API key or use existing credentials
4. Note your Organization ID from the account settings

## Output Format

The exported JSON file contains:

```json
{
  "exportedAt": "2024-01-01T10:00:00.000Z",
  "organizationId": "your_org_id",
  "fromDate": "2024-01-01",
  "totalConversations": 150,
  "exportedChats": 148,
  "chats": [
    {
      "chatId": "chat_123",
      "organizationId": "your_org_id",
      "createdAt": "2024-01-01T09:30:00Z",
      "updatedAt": "2024-01-01T10:45:00Z",
      "status": "closed",
      "customerEmail": "customer@example.com",
      "customerName": "John Doe",
      "assignedAgent": "Agent Smith",
      "messageCount": 8,
      "conversationText": "[USER] Hello, I need help with my account\n[AGENT] Hi! I'd be happy to help you with your account. What specific issue are you experiencing?\n[USER] I can't log in to my dashboard\n[AGENT] Let me help you troubleshoot that..."
    }
  ]
}
```

### Conversation Text Format

Each conversation is consolidated into a single string with messages tagged as:
- `[USER]` - Customer messages
- `[AGENT]` - Support agent messages

This format is optimized for AI training, allowing models to learn conversation patterns and responses.

## Rate Limiting

The script includes built-in rate limiting to respect HelpCrunch API limits:
- 100ms delay between conversation requests
- 200ms delay between message requests
- Automatic pagination handling

## Error Handling

- Network errors are handled gracefully with retries
- Invalid conversations are skipped but logged
- Progress is saved incrementally
- Detailed error messages for troubleshooting

## License

ISC License - see LICENSE file for details.
