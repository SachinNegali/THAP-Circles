import mongoose from 'mongoose';

/**
 * Location schema for flexible location types
 * Supports three types:
 * - point: Specific coordinates (lat/lng)
 * - area: Area within a city
 * - city: Just city name
 */
const locationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['point', 'area', 'city'],
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    coordinates: {
      lat: {
        type: Number,
        min: -90,
        max: 90,
      },
      lng: {
        type: Number,
        min: -180,
        max: 180,
      },
    },
    city: {
      type: String,
      trim: true,
    },
    area: {
      type: String,
      trim: true,
    },
  },
  { _id: false }
);

export default locationSchema;
