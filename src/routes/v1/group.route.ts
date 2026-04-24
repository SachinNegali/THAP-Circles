import { Router } from 'express';
import authMiddleware from '../../middlewares/auth.middleware.js';
import {
  verifyGroupMembership,
  verifyGroupAdmin,
  verifyGroupCreator,
} from '../../middlewares/groupAuth.js';
import { validate } from '../../middlewares/validate.middleware.js';
import {
  createGroupSchema,
  createDMSchema,
  updateGroupSchema,
  addMembersSchema,
  updateMemberRoleSchema,
  sendMessageSchema,
  groupIdParamsSchema,
  groupIdUserIdParamsSchema,
  recipientIdParamsSchema,
  paginationQuerySchema,
  messagesListQuerySchema,
} from '../../validations/group.validation.js';
import {
  createGroup,
  createDM,
  getGroup,
  getUserGroups,
  updateGroup,
  addMembers,
  removeMember,
  updateMemberRole,
  leaveGroup,
  deleteGroup,
  sendMessage,
  sendDMMessage,
  getMessages,
  getDMMessages,
} from '../../controllers/group.controller.js';

const router = Router();

router.use(authMiddleware);

// Group management
router.post('/', validate(createGroupSchema), createGroup);
router.get('/', validate(paginationQuerySchema, 'query'), getUserGroups);

// DM sub-routes (literal /dm must come before /:id)
router.post('/dm', validate(createDMSchema), createDM);
router.get(
  '/dm/:recipientId/messages',
  validate(recipientIdParamsSchema, 'params'),
  validate(messagesListQuerySchema, 'query'),
  getDMMessages
);
router.post(
  '/dm/:recipientId/messages',
  validate(recipientIdParamsSchema, 'params'),
  validate(sendMessageSchema),
  sendDMMessage
);

// :id routes
router.get(
  '/:id',
  validate(groupIdParamsSchema, 'params'),
  verifyGroupMembership,
  getGroup
);
router.patch(
  '/:id',
  validate(groupIdParamsSchema, 'params'),
  verifyGroupMembership,
  validate(updateGroupSchema),
  updateGroup
);
router.delete(
  '/:id',
  validate(groupIdParamsSchema, 'params'),
  verifyGroupCreator,
  deleteGroup
);

// Member management
router.post(
  '/:id/members',
  validate(groupIdParamsSchema, 'params'),
  verifyGroupAdmin,
  validate(addMembersSchema),
  addMembers
);
router.delete(
  '/:id/members/:userId',
  validate(groupIdUserIdParamsSchema, 'params'),
  verifyGroupMembership,
  removeMember
);
router.patch(
  '/:id/members/:userId/role',
  validate(groupIdUserIdParamsSchema, 'params'),
  verifyGroupAdmin,
  validate(updateMemberRoleSchema),
  updateMemberRole
);
router.post(
  '/:id/leave',
  validate(groupIdParamsSchema, 'params'),
  verifyGroupMembership,
  leaveGroup
);

// Messages
router.post(
  '/:id/messages',
  validate(groupIdParamsSchema, 'params'),
  verifyGroupMembership,
  validate(sendMessageSchema),
  sendMessage
);
router.get(
  '/:id/messages',
  validate(groupIdParamsSchema, 'params'),
  verifyGroupMembership,
  validate(messagesListQuerySchema, 'query'),
  getMessages
);

export default router;
