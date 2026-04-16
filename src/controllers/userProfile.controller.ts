import { Request, Response } from 'express';
import UserProfile, { IUserProfile } from '../models/userProfile.model.js';

const serialize = (profile: IUserProfile) => ({
  user: profile.user,
  bloodGroup: profile.bloodGroup ?? null,
  address: profile.address ?? null,
  emergencyContacts: profile.emergencyContacts,
  createdAt: profile.createdAt,
  updatedAt: profile.updatedAt,
});

/**
 * GET /user/profile
 * Returns the authenticated user's profile, creating an empty one lazily
 * so clients always get a stable shape.
 */
export const getProfile = async (req: Request, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) {
    res.status(401).json({ message: 'User not authenticated' });
    return;
  }

  let profile = await UserProfile.findByUser(user._id);
  if (!profile) {
    profile = await UserProfile.create({ user: user._id });
  }

  res.status(200).json(serialize(profile));
};

/**
 * PATCH /user/profile
 * Upserts bloodGroup, address, and/or full emergencyContacts list.
 * Only top-level fields in the payload are touched.
 */
export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) {
    res.status(401).json({ message: 'User not authenticated' });
    return;
  }

  const { bloodGroup, address, emergencyContacts } = req.body as {
    bloodGroup?: string;
    address?: Record<string, string>;
    emergencyContacts?: Array<{ name: string; phone: string; relation?: string }>;
  };

  const profile =
    (await UserProfile.findByUser(user._id)) ??
    (await UserProfile.create({ user: user._id }));

  if (bloodGroup !== undefined) profile.bloodGroup = bloodGroup as IUserProfile['bloodGroup'];
  if (address !== undefined) profile.address = address;
  if (emergencyContacts !== undefined) {
    profile.emergencyContacts.splice(0, profile.emergencyContacts.length, ...emergencyContacts);
  }

  await profile.save();
  res.status(200).json(serialize(profile));
};

/**
 * POST /user/profile/emergency-contacts
 * Appends a single contact. Enforces a soft cap of 10.
 */
export const addEmergencyContact = async (req: Request, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) {
    res.status(401).json({ message: 'User not authenticated' });
    return;
  }

  const profile =
    (await UserProfile.findByUser(user._id)) ??
    (await UserProfile.create({ user: user._id }));

  if (profile.emergencyContacts.length >= 10) {
    res.status(409).json({ message: 'Maximum of 10 emergency contacts reached' });
    return;
  }

  profile.emergencyContacts.push(req.body);
  await profile.save();

  res.status(201).json(serialize(profile));
};

/**
 * PATCH /user/profile/emergency-contacts/:contactId
 */
export const updateEmergencyContact = async (req: Request, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) {
    res.status(401).json({ message: 'User not authenticated' });
    return;
  }

  const contactId = String(req.params['contactId']);
  const profile = await UserProfile.findByUser(user._id);
  if (!profile) {
    res.status(404).json({ message: 'Profile not found' });
    return;
  }

  const contact = profile.emergencyContacts.id(contactId);
  if (!contact) {
    res.status(404).json({ message: 'Emergency contact not found' });
    return;
  }

  Object.assign(contact, req.body);
  await profile.save();
  res.status(200).json(serialize(profile));
};

/**
 * DELETE /user/profile/emergency-contacts/:contactId
 */
export const deleteEmergencyContact = async (req: Request, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) {
    res.status(401).json({ message: 'User not authenticated' });
    return;
  }

  const contactId = String(req.params['contactId']);
  const profile = await UserProfile.findByUser(user._id);
  if (!profile) {
    res.status(404).json({ message: 'Profile not found' });
    return;
  }

  const contact = profile.emergencyContacts.id(contactId);
  if (!contact) {
    res.status(404).json({ message: 'Emergency contact not found' });
    return;
  }

  contact.deleteOne();
  await profile.save();
  res.status(200).json(serialize(profile));
};
