import type { NextFunction, Request, Response } from 'express';

/**
 * Optional bearer-token authentication for /api routes.
 * Enabled only when CALAMOX_TOKEN is set at startup.
 */
export function authMiddleware(token: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization ?? '';
    const [scheme, provided] = header.split(' ');
    if (scheme !== 'Bearer' || provided !== token) {
      res.status(401).json({ error: 'Unauthorized: missing or invalid Bearer token.' });
      return;
    }
    next();
  };
}
