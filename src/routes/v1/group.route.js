import express from 'express';
import * as groupController from '../../controllers/group.controller.js';
import * as messageController from '../../controllers/message.controller.js';
import auth from '../../middlewares/auth.js';
import { verifyGroupMembership, verifyGroupAdmin, verifyGroupCreator } from '../../middlewares/groupAuth.js';

const router = express.Router();

// All routes require authentication
router.use(auth);

// Group management routes
router.post('/', groupController.createGroup);
router.get('/', groupController.getUserGroups);
router.get('/:id', verifyGroupMembership, groupController.getGroup);
router.patch('/:id', verifyGroupMembership, groupController.updateGroup);
router.delete('/:id', verifyGroupCreator, groupController.deleteGroup);

// Member management routes
router.post('/:id/members', verifyGroupAdmin, groupController.addMembers);
router.delete('/:id/members/:userId', verifyGroupMembership, groupController.removeMember);
router.patch('/:id/members/:userId/role', verifyGroupAdmin, groupController.updateMemberRole);
router.post('/:id/leave', verifyGroupMembership, groupController.leaveGroup);

// Message routes
router.post('/:id/messages', verifyGroupMembership, groupController.sendMessage);
router.get('/:id/messages', verifyGroupMembership, groupController.getMessages);

export default router;
