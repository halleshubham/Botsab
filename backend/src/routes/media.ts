import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import { requireApiKey } from "../auth/middleware.js";
import { config } from "../config.js";

const router = Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  // Video needs more headroom than a typical image - a stitched multi-scene
  // reel commonly lands in the 10-50MB range.
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image or video files are allowed"));
    }
  },
});

router.use(requireApiKey);

router.post("/upload", upload.single("file"), (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  res.json({ fileId: req.file.filename, mimeType: req.file.mimetype });
});

export default router;
