import { createRef } from 'react';
import type { ConfigClient } from '../services/config/ConfigClient';

export const configClientRef = createRef<ConfigClient | null>() as React.MutableRefObject<ConfigClient | null>;
