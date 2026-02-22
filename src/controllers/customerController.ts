import { Request, Response } from 'express';
import { prisma } from '../utils/db';
import { AuthRequest } from '../middleware/auth';
import { z } from 'zod';

const customerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(3),
  email: z.string().email().optional().or(z.literal('')),
  operator: z.string().optional(),
  notes: z.string().optional(),
  contractEndDate: z.string().optional(), // ISO String
});

export const getCustomers = async (req: AuthRequest, res: Response) => {
  try {
    const { search, agentId, operator, status, page = 1, limit = 50 } = req.query;

    const where: any = {};

    // Filter logic
    if (req.user?.role !== 'ADMIN') {
       // Agents only see assigned or not hidden, unless specifically transferred
       where.OR = [
         { assignedAgentId: req.user?.id },
         { isHidden: false } // Optionally restrict this further based on business rules
       ];
    } else if (agentId) {
       where.assignedAgentId = String(agentId);
    }

    if (search) {
      where.OR = [
        { name: { contains: String(search), mode: 'insensitive' } },
        { phone: { contains: String(search) } },
      ];
    }

    if (operator && operator !== 'All') where.operator = String(operator);
    if (status && status !== 'All') where.lastCallStatus = status === 'None' ? null : status;

    const customers = await prisma.customer.findMany({
      where,
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
      orderBy: { updatedAt: 'desc' },
      include: { assignedAgent: { select: { id: true, name: true } } }
    });

    const total = await prisma.customer.count({ where });

    res.json({ data: customers, meta: { total, page: Number(page), limit: Number(limit) } });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching customers' });
  }
};

export const createCustomer = async (req: AuthRequest, res: Response) => {
  try {
    const data = customerSchema.parse(req.body);
    
    // Check duplicate
    const existing = await prisma.customer.findUnique({ where: { phone: data.phone } });
    if (existing) return res.status(400).json({ error: 'Customer with this phone exists' });

    const customer = await prisma.customer.create({
      data: {
        ...data,
        assignedAgentId: req.user?.role === 'AGENT' ? req.user.id : undefined,
        contractEndDate: data.contractEndDate ? new Date(data.contractEndDate) : null
      }
    });

    await prisma.auditLog.create({
      data: {
        action: 'CREATE_CUSTOMER',
        details: `Created customer ${customer.name}`,
        userId: req.user!.id
      }
    });

    res.status(201).json(customer);
  } catch (error) {
    res.status(400).json({ error: 'Validation error or server error' });
  }
};

export const updateCustomer = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { notes, assignedAgentId, isHidden } = req.body;

    const customer = await prisma.customer.update({
      where: { id },
      data: {
        notes,
        assignedAgentId,
        isHidden
      }
    });

    res.json(customer);
  } catch (error) {
    res.status(500).json({ error: 'Error updating customer' });
  }
};

export const importCustomers = async (req: AuthRequest, res: Response) => {
  try {
    // Expects JSON array of customers from frontend CSV parser
    const customersRaw = req.body.customers; 
    if (!Array.isArray(customersRaw)) return res.status(400).json({ error: 'Invalid format' });

    let importedCount = 0;
    let duplicateCount = 0;

    for (const c of customersRaw) {
      const existing = await prisma.customer.findUnique({ where: { phone: c.phone } });
      if (existing) {
        duplicateCount++;
        continue;
      }

      await prisma.customer.create({
        data: {
          name: c.name,
          phone: c.phone,
          email: c.email,
          notes: c.notes,
          operator: c.operator || 'Unknown',
          createdAt: new Date(),
        }
      });
      importedCount++;
    }

    res.json({ imported: importedCount, duplicates: duplicateCount });
  } catch (error) {
    res.status(500).json({ error: 'Import failed' });
  }
};

// Bulk Actions & Distribution
export const bulkAction = async (req: AuthRequest, res: Response) => {
    try {
        const { ids, action, targetAgentId, distributionMethod } = req.body;
        // action: 'distribute' | 'transfer' | 'hide'
        
        if (!ids || !Array.isArray(ids)) return res.status(400).json({error: 'IDs array required'});

        if (action === 'hide') {
            await prisma.customer.updateMany({
                where: { id: { in: ids } },
                data: { isHidden: true }
            });
        } 
        else if (action === 'transfer') {
             await prisma.customer.updateMany({
                where: { id: { in: ids } },
                data: { assignedAgentId: targetAgentId }
            });
        }
        else if (action === 'distribute' && Array.isArray(targetAgentId)) {
             // targetAgentId is array of agent IDs here
             const agentIds = targetAgentId as string[];
             
             // Get current load if balanced
             // Simple Round Robin for this implementation to respect code limits
             const updates = ids.map((customerId: string, index: number) => {
                 const agentId = agentIds[index % agentIds.length];
                 return prisma.customer.update({
                     where: { id: customerId },
                     data: { assignedAgentId: agentId }
                 });
             });
             
             await prisma.$transaction(updates);
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Bulk action failed' });
    }
}