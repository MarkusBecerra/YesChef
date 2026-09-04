// Runs before every test file: point the app at a throwaway in-memory database.
process.env.DATABASE_URL = ":memory:";
delete process.env.DATABASE_AUTH_TOKEN;
