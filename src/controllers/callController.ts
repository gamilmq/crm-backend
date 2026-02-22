import { Response } from 'express';
import { prisma } from '../utils/db';
import { AuthRequest } from '../middleware/auth';
import { CallStatus } from '@prisma/client';

export const logCall = async (req: AuthRequest, res: Response) => {
  try {
    const { customerId, duration, status, direction, notes } = req.body;
    // status: ANSWERED, NO_ANSWER, MISSED

    // 1. Create Log
    const callLog = await prisma.callLog.create({
      data: {
        agentId: req.user!.id,
        customerId,
        duration: Number(duration),
        status,
        direction,
        notes
      }
    });

    // 2. Update Customer Metrics
    const updateData: any = {
        lastCallDate: new Date(),
        lastCallStatus: status
    };

    if (status === 'ANSWERED') {
        updateData.contactCount = { increment: 1 };
    }

    await prisma.customer.update({
        where: { id: customerId },
        data: updateData
    });

    res.status(201).json(callLog);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to log call' });
  }
};

export const getDashboardStats = async (req: AuthRequest, res: Response) => {
    try {
        const totalCalls = await prisma.callLog.count();
        const totalCustomers = await prisma.customer.count();
        
        // Inactive customers (> 7 days no call)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        const inactiveCustomers = await prisma.customer.count({
            where: {
                OR: [
                    { lastCallDate: null },
                    { lastCallDate: { lt: sevenDaysAgo } }
                ],
                isHidden: false
            }
        });

        // Top Agent (Most Answered Calls)
        const topAgentGroup = await prisma.callLog.groupBy({
            by: ['agentId'],
            where: { status: 'ANSWERED' },
            _count: { id: true },
            orderBy: { _count: { id: 'desc' } },
            take: 1
        });
        
        let topAgentName = '-';
        if (topAgentGroup.length > 0) {
            const agent = await prisma.user.findUnique({ where: { id: topAgentGroup[0].agentId }});
            topAgentName = agent?.name || 'Unknown';
        }

        res.json({
            totalCalls,
            totalCustomers,
            inactiveCustomers,
            topAgent: topAgentName
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
}