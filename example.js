const HelpCrunchExporter = require('./index.js');

// Example usage of the HelpCrunch exporter
async function example() {
    try {
        // You can also create an instance with custom configuration
        process.env.HELPCRUNCH_API_KEY = 'your_api_key';
        process.env.HELPCRUNCH_API_SECRET = 'your_api_secret';
        process.env.HELPCRUNCH_ORGANIZATION_ID = 'your_org_id';
        process.env.FROM_DATE = '2024-01-01';
        process.env.OUTPUT_FILE = 'example_export.json';

        const exporter = new HelpCrunchExporter();
        await exporter.export();
        
        console.log('Export completed successfully!');
    } catch (error) {
        console.error('Export failed:', error.message);
    }
}

// Uncomment to run example
// example();