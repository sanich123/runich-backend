import * as yaml from 'js-yaml';
import { readFileSync } from 'fs';
export const document = yaml.load(readFileSync('./doc/api.yaml', 'utf-8'));
