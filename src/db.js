const sql = require('mssql');

const connectionString = process.env.DB_CONNECTION_STRING;

if (!connectionString) {
  console.error('DB_CONNECTION_STRING is not set in .env');
  process.exit(1);
}

const poolPromise = new sql.ConnectionPool(connectionString)
  .connect()
  .then(pool => {
    console.log('Connected to Azure SQL Database');
    return pool;
  })
  .catch(err => {
    console.error('Database connection failed:', err);
    process.exit(1);
  });

module.exports = { sql, poolPromise };