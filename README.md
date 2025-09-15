# HelpCrunch Chat Export

Export conversations from HelpCrunch to JSON and CSV format, optimized for AI training data.

## Features

- **Department Filtering**: Export conversations from specific departments
- **Date Filtering**: Export conversations from a specific date onwards
- **Full Message History**: Fetch complete conversation threads with proper USER/AGENT tagging
- **Incremental Caching**: Resume exports without reprocessing existing conversations
- **Dual Output**: Generate both JSON (for AI analysis) and CSV (for quick review)
- **AI-Ready Format**: Structured conversation text optimized for AI categorization
- **Rate Limiting**: Built-in delays to respect API limits
- **Progress Tracking**: Batch processing with automatic saves

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
   HELPCRUNCH_API_KEY=your_bearer_token_here
   HELPCRUNCH_ORGANIZATION_ID=your_organization_id
   FROM_DATE=2025-08-01
   OUTPUT_FILE=exported_chats.json
   ```

## Usage

### Quick Start

1. **Install and Configure**:
   ```bash
   npm install
   cp .env.example .env
   # Edit .env with your HelpCrunch Bearer token
   ```

2. **Run Export**:
   ```bash
   npm start
   ```

### Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `npm start` | `node index.js` | Run the export with current configuration |
| `npm run export` | `node index.js` | Same as start |

### Direct Node.js execution
```bash
node index.js
```

## Configuration

### Environment Variables

The tool requires a `.env` file with the following configuration:

```bash
# HelpCrunch API Credentials
HELPCRUNCH_API_KEY=your_bearer_token_here  # Your HelpCrunch Bearer token
HELPCRUNCH_ORGANIZATION_ID=your_organization_id  # Organization filter

# Date Configuration  
FROM_DATE=2025-08-01                       # Export conversations from this date onwards (YYYY-MM-DD)

# Output Configuration
OUTPUT_FILE=exported_chats.json            # Primary JSON output file
```

### HelpCrunch API Setup

1. Log into your HelpCrunch account
2. Go to Settings → API
3. Generate a Bearer token (not API key/secret)
4. Copy the Bearer token to `HELPCRUNCH_API_KEY` in your `.env` file

Note: This tool uses HelpCrunch API v1 with Bearer token authentication.

## Output Files

The tool generates several output files:

### Primary Outputs
- `exported_chats.json` - Complete conversation data in JSON format
- `exported_chats_summary.csv` - CSV summary with conversation categorization

### Working Files (Auto-generated)
- `chat_cache.json` - Incremental cache for resuming exports
- Automatically excluded from git via `.gitignore`

## Output Format

### JSON Structure
```json
{
  "exportTimestamp": "2025-01-13T10:30:00.000Z",
  "fromDate": "2025-08-01",
  "departmentFilter": "Support",
  "totalConversationsAfterFiltering": 229,
  "conversations": [
    {
      "id": "conv123",
      "customerEmail": "user@example.com",
      "subject": "Technical support request",
      "status": "closed",
      "createdAt": 1722470400,
      "updatedAt": 1722556800,
      "assigneeName": "Support Agent",
      "departmentName": "Support",
      "conversationText": "USER: I need help with my account\nAGENT: I'd be happy to help you with that..."
    }
  ]
}
```

### CSV Summary Format
The CSV contains categorized conversations with columns:
- ID, Customer Email, Subject, Status, Created Date, Updated Date
- Assignee, Department, Category, Conversation Text (truncated)

Categories include: Technical Issues, Account Help, Billing, Product Support, and General Questions.

See `sample-output.json` for a complete example with multiple conversations.

## Data Processing

### Department Filtering
- Automatically filters to include conversations from specified departments
- Excludes other departments from export based on configuration
- Based on assignee names and department fields

### Date Filtering  
- Exports conversations created on or after the `FROM_DATE`
- Date format: YYYY-MM-DD (e.g., "2025-08-01")
- Helps focus on recent support interactions

### Message Consolidation
- Fetches all messages for each conversation
- Combines into single text with USER/AGENT prefixes
- Preserves conversation flow and context
- Optimized format for AI analysis

### Incremental Processing
- Saves progress every 10 conversations
- Resumes from cache if export is interrupted
- Prevents data loss during long exports
- Automatically handles API rate limits

### Conversation Text Format

Each conversation is consolidated into a single string with messages tagged as:
- `USER` - Customer messages  
- `AGENT` - Support agent messages

This format is optimized for AI training, allowing models to learn conversation patterns and responses.

## Rate Limiting & Error Handling

The script includes built-in safeguards for reliable operation:

### Rate Limiting
- 100ms delay between conversation requests
- 200ms delay between message requests  
- Automatic pagination handling
- Respects HelpCrunch API limits

### Error Handling
- Network errors are handled gracefully with retries
- Invalid conversations are skipped but logged
- Progress is saved incrementally every 10 conversations
- Detailed error messages for troubleshooting
- Resumable exports using cache system

### Performance Features
- Incremental caching prevents reprocessing existing data
- Batch processing for memory efficiency
- Progress tracking with detailed logging
- Automatic recovery from interruptions

## License

ISC License - see LICENSE file for details.
