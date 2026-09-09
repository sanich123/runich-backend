import 'dotenv/config';

process.env.JWT_SECRET ??= 'runich-integration-test-secret';
process.env.SEED_MOCK_DATA = 'false';
