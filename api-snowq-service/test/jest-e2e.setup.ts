import * as dotenv from 'dotenv';
import * as path from 'path';

// AppModule arrastra DatabaseModule (TypeOrmModule + ConfigModule con validationSchema Joi),
// asi que necesita las mismas env vars que main.ts precarga antes de bootstrap. Los e2e
// corren siempre contra el entorno de desarrollo local (MySQL + servicenow-clone-backend).
dotenv.config({ path: path.resolve(__dirname, '..', '.env.development') });
