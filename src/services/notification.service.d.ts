/**
 * Type shim for the legacy JS notification.service module.
 * Only the surface consumed by TS callers is declared here; the rest
 * remains untyped from JS callers' perspective.
 */

import { Types } from 'mongoose';

export function createNotification(
  userId: Types.ObjectId | string,
  type: string,
  title: string,
  message: string,
  data?: Record<string, unknown>
): Promise<unknown>;

export function createNotifications(
  userIds: Array<Types.ObjectId | string>,
  type: string,
  title: string,
  message: string,
  data?: Record<string, unknown>
): Promise<unknown>;
