import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
  };
  // Explicitly define properties to resolve type errors in controllers
  body: any;
  query: any;
  params: any;
  headers: any;
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  // Use req.headers to avoid 'header' method missing error and ensure type safety
  const authHeader = req.headers['authorization'];
  const token = typeof authHeader === 'string' ? authHeader.replace('Bearer ', '') : undefined;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};