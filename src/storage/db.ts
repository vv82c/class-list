import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Course, PhotoMeta } from '../types';
import { deleteFile } from './opfs';

interface AppDB extends DBSchema {
  courses: {
    key: string;
    value: Course;
    indexes: { 'by-created': number };
  };
  photos: {
    key: string;
    value: PhotoMeta;
    indexes: { 'by-created': number; 'by-course': string };
  };
}

let dbPromise: Promise<IDBPDatabase<AppDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<AppDB>('class-list', 2, {
      upgrade(db) {
        const courses = db.createObjectStore('courses', { keyPath: 'id' });
        courses.createIndex('by-created', 'createdAt');
        const photos = db.createObjectStore('photos', { keyPath: 'id' });
        photos.createIndex('by-created', 'createdAt');
        // sparse：courseId 为 ''（未归属）时不建索引项，'' 不是合法的 IDB 索引键
        photos.createIndex('by-course', 'courseId', { unique: false, sparse: true } as IDBIndexParameters);
      },
    });
  }
  return dbPromise;
}

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function getCourses(): Promise<Course[]> {
  const all = await (await getDB()).getAll('courses');
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getCourse(id: string): Promise<Course | undefined> {
  return (await getDB()).get('courses', id);
}

export async function putCourse(course: Course): Promise<void> {
  await (await getDB()).put('courses', course);
}

export async function deleteCourse(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('courses', id);
  const tx = db.transaction('photos', 'readwrite');
  for await (const cursor of tx.store) {
    if (cursor.value.courseId === id) {
      await cursor.update({ ...cursor.value, courseId: '', capture: 'none' });
    }
  }
  await tx.done;
}

export async function getPhotos(): Promise<PhotoMeta[]> {
  const all = await (await getDB()).getAll('photos');
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getPhotosByCourse(courseId: string): Promise<PhotoMeta[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('photos', 'by-course', courseId);
  return all.sort((a, b) => (b.takenAt ?? b.createdAt) - (a.takenAt ?? a.createdAt));
}

export async function putPhoto(photo: PhotoMeta): Promise<void> {
  await (await getDB()).put('photos', photo);
}

export async function deletePhoto(photo: PhotoMeta): Promise<void> {
  await (await getDB()).delete('photos', photo.id);
  for (const f of [photo.fileName, photo.thumbFileName, photo.cropFileName]) {
    if (f) await deleteFile(f).catch(() => {});
  }
}
