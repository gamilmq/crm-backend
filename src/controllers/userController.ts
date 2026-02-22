import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../utils/db';
import { z } from 'zod';

const userSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['ADMIN', 'AGENT']),
  sipExtension: z.string().optional(),
  sipPassword: z.string().optional(),
  department: z.string().optional(),
});

export const createUser = async (req: Request, res: Response) => {
  try {
    const data = userSchema.parse(req.body);
    
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) return res.status(400).json({ error: 'Email exists' });

    const passwordHash = await bcrypt.hash(data.password, 10);

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
        role: data.role,
        sipExtension: data.sipExtension,
        sipPassword: data.sipPassword, // Stored securely in a real app (reversible encryption)
        department: data.department
      }
    });

    const { passwordHash: _, sipPassword: __, ...safeUser } = user;
    res.status(201).json(safeUser);
  } catch (error) {
    res.status(400).json({ error: 'Validation failed' });
  }
};

export const getUsers = async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        availability: true,
        department: true,
        sipExtension: true,
        avatar: true
      }
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

export const updateUser = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { status, availability, password, sipExtension, sipPassword } = req.body;
        
        const updateData: any = { status, availability, sipExtension, sipPassword };
        if (password) {
            updateData.passwordHash = await bcrypt.hash(password, 10);
        }

        const user = await prisma.user.update({
            where: { id },
            data: updateData
        });

        res.json({ id: user.id, status: user.status });
    } catch(error) {
        res.status(500).json({ error: 'Update failed' });
    }
}