import { Router } from 'express';
import { authenticate, requireAdmin } from './middleware/auth';
import * as Auth from './controllers/authController';
import * as Customer from './controllers/customerController';
import * as Call from './controllers/callController';
import * as User from './controllers/userController';

const router = Router();

// Auth
router.post('/auth/login', Auth.login);
router.get('/auth/me', authenticate, Auth.getMe);
router.get('/auth/sip-config', authenticate, Auth.getSipConfig);

// Customers
router.get('/customers', authenticate, Customer.getCustomers);
router.post('/customers', authenticate, Customer.createCustomer);
router.put('/customers/:id', authenticate, Customer.updateCustomer);
router.post('/customers/import', authenticate, requireAdmin, Customer.importCustomers);
router.post('/customers/bulk', authenticate, requireAdmin, Customer.bulkAction);

// Calls
router.post('/calls', authenticate, Call.logCall);
router.get('/dashboard/stats', authenticate, Call.getDashboardStats);

// Agents (Admin Only)
router.get('/users', authenticate, requireAdmin, User.getUsers);
router.post('/users', authenticate, requireAdmin, User.createUser);
router.put('/users/:id', authenticate, requireAdmin, User.updateUser);

export default router;