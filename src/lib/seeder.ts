import { collection, doc, getDoc, getDocs, writeBatch, type Firestore } from "firebase/firestore";
import { prototypeUsers } from "./placeholder-data";

/**
 * Seeds the database with prototype users and a store if they don't exist.
 * This function is designed to be run only once on startup.
 * @param db The Firestore instance.
 */
export async function seedDatabase(db: Firestore) {
  // Seeding logic is being removed to favor a fully static prototype mode.
  // This prevents inconsistencies between DB state and prototype state.
  return;
}
