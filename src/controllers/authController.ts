import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/db';
import { AuthRequest } from '../middleware/auth';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.status === 'DISABLED') {
      return res.status(403).json({ error: 'Account is disabled' });
    }

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, {
      expiresIn: '24h',
    });

    // Don't send password hashes or SIP passwords in generic login response
    const { passwordHash, sipPassword, ...userProfile } = user;

    res.json({ token, user: userProfile });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

export const getMe = async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user?.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const { passwordHash, sipPassword, ...userProfile } = user;
    res.json(userProfile);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

// Specific endpoint for Softphone configuration (Secure)
export const getSipConfig = async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user?.id } });
    if (!user || !user.sipExtension) {
      return res.status(400).json({ error: 'SIP not configured for user' });
    }

    // Return sensitive SIP credentials only here
    res.json({
      server: process.env.SIP_SERVER_HOST || 'wss://sip.cloudconnect.com',
      domain: process.env.SIP_DOMAIN || 'cloudconnect.com',
      extension: user.sipExtension,
      password: user.sipPassword
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};