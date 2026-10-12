type EsbuildJsxOptions = {
  jsx?: 'transform' | 'preserve' | 'automatic' | 'react-jsx' | 'react-jsxdev';
};

export default {
  entry: {
    main: 'src/main.ts',
    'background-worker': 'src/app/background-worker.ts',
    'send-deployment-success-email': 'scripts/send-deployment-success-email.ts',
  },
  format: ['esm'],
  target: 'node26',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  // tsup runs SWC first to preserve Nest decorator metadata, so both transforms
  // need the automatic JSX runtime configured.
  swc: {
    jsc: {
      transform: {
        react: {
          runtime: 'automatic',
        },
      },
    },
  },
  esbuildOptions(options: EsbuildJsxOptions) {
    options.jsx = 'automatic';
  },
  external: [
    '@ardentcode/sports-lib',
    '@aws-sdk/client-s3',
    '@mapbox/polyline',
    '@maplibre/maplibre-gl-native',
    '@nestjs/common',
    '@nestjs/core',
    '@nestjs/jwt',
    '@nestjs/passport',
    '@nestjs/platform-express',
    '@nestjs/swagger',
    '@prisma/cli-engine',
    '@prisma/orm-postgres',
    '@prisma/orm-postgres/orm-client',
    '@prisma/orm-postgres/runtime',
    '@react-email/components',
    '@we-gold/gpxjs',
    'adm-zip',
    'bcrypt',
    'class-transformer',
    'class-validator',
    'csv-parse',
    'dotenv',
    'express',
    'js-yaml',
    'multer',
    'nodemailer',
    'passport',
    'passport-jwt',
    'pg',
    'react',
    'react-dom',
    'reflect-metadata',
    'rxjs',
    'sharp',
    'tcx-js',
    'uuid',
    'xmldom-qsa',
  ],
};
