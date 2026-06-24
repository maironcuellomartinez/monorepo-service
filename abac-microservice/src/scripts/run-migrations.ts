import { dataSource } from "data-source";

async function runMigrations() {
    try {
        console.log('Initializing DataSource...');
        await dataSource.initialize();
        console.log('DataSource initialized successfully');

        console.log('Running migrations...');
        const migrations = await dataSource.runMigrations();

        console.log(`Executed ${migrations.length} migrations:`);
        migrations.forEach(migration => {
            console.log(`- ${migration.name}`);
        });

        await dataSource.destroy();
        console.log('Migrations completed successfully!');

    } catch (error) {
        console.error('Error during migrations:', error);
        process.exit(1);
    }
}

runMigrations();