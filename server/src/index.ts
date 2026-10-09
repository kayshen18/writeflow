import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import mysql from "mysql2/promise";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import * as jwt from "jsonwebtoken";
import * as fs from "node:fs";
import * as path from "node:path";
import multer from "multer";
import { createServer } from "node:http";
import { Server } from "socket.io";

dotenv.config();

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  throw new Error("JWT_SECRET is missing from server/.env");
}

type AuthenticatedRequest = Request & {
  userId?: string;
};

function requireAuth(
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): void {
  const authorization = request.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    response.status(401).json({
      message: "You must be logged in to access this resource.",
    });
    return;
  }

  const token = authorization.slice("Bearer ".length);

  try {
    const payload = jwt.verify(token, jwtSecret);

    const userId =
      typeof payload === "object" && typeof payload.sub === "string"
        ? payload.sub
        : null;

    if (!userId) {
      response.status(401).json({
        message: "Invalid login token.",
      });
      return;
    }

    response.locals.userId = userId;
    request.userId = userId;
    next();
  } catch {
    response.status(401).json({
      message: "Your login session has expired. Please log in again.",
    });
  }
}

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});
io.use((socket, next) => {
  const token = socket.handshake.auth.token;

  if (typeof token !== "string") {
    next(new Error("Authentication required."));
    return;
  }

  try {
    const payload = jwt.verify(
      token,
      jwtSecret,
    );

    const userId =
      typeof payload === "object" &&
      typeof payload.sub === "string"
        ? payload.sub
        : null;

    if (!userId) {
      next(new Error("Invalid authentication token."));
      return;
    }

    socket.data.userId = userId;

    next();
  } catch {
    next(new Error("Invalid authentication token."));
  }
});
const uploadsDirectory = path.join(process.cwd(), "uploads");

fs.mkdirSync(uploadsDirectory, {
  recursive: true,
});

const imageUpload = multer({
  storage: multer.diskStorage({
    destination(request, _file, callback) {
      const userId = (request as AuthenticatedRequest).userId;

      if (!userId) {
        callback(new Error("You must be logged in to upload images."));
        return;
      }

      const userUploadsDirectory = path.join(
        uploadsDirectory,
        userId,
      );

      fs.mkdirSync(userUploadsDirectory, {
        recursive: true,
      });

      callback(null, userUploadsDirectory);
    },

    filename(_request, file, callback) {
      const extension =
        path.extname(file.originalname).toLowerCase() || ".image";

      callback(null, `${randomUUID()}${extension}`);
    },
  }),

  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 10,
  },

  fileFilter(_request, file, callback) {
    if (!file.mimetype.startsWith("image/")) {
      callback(new Error("Only image files are allowed."));
      return;
    }

    callback(null, true);
  },
});

const port = Number(process.env.PORT) || 3000;

const database = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

app.use(
  cors({
    origin: "http://localhost:5173",
  }),
);

app.use(express.json());

app.use("/uploads", express.static(uploadsDirectory));

app.get("/api/health", async (_request, response) => {
  try {
    const [rows] = await database.query("select 1 as connected");

    response.json({
      message: "WriteFlow API is running",
      database: "connected",
      result: rows,
    });
  } catch (error) {
    console.error(error);

    response.status(500).json({
      message: "Database connection failed",
    });
  }
});

app.get("/api/works", async (_request, response) => {
  try {
    const [works] = await database.query(`
      select
        works.id,
        works.title,
        works.work_type,
        works.description,
        works.cover_path,
        works.category,
        works.tags,
        works.published_at,
        users.display_name as author_name,
        users.avatar_path as author_avatar_path
      from works
      inner join users
        on works.author_id = users.id
      where works.is_published = true
      order by works.published_at desc
    `);

    response.json({ works });
  } catch (error) {
    console.error(error);

    response.status(500).json({
      message: "Unable to load published works.",
    });
  }
});

app.post("/api/auth/register", async (request, response) => {
  try {
    const { email, password, displayName } = request.body;

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      typeof displayName !== "string"
    ) {
      response.status(400).json({
        message: "Email, password, and display name are required.",
      });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = displayName.trim();

    if (!normalizedEmail || !normalizedName || password.length < 6) {
      response.status(400).json({
        message:
          "Please provide a valid email, a display name, and a password of at least 6 characters.",
      });
      return;
    }

    const [existingUsers] = await database.query(
      "select id from users where email = ? limit 1",
      [normalizedEmail],
    );

    if (Array.isArray(existingUsers) && existingUsers.length > 0) {
      response.status(409).json({
        message: "An account with this email already exists.",
      });
      return;
    }

    const userId = randomUUID();
    const passwordHash = await bcrypt.hash(password, 12);

    await database.query(
      `
        insert into users (id, email, password_hash, display_name)
        values (?, ?, ?, ?)
      `,
      [userId, normalizedEmail, passwordHash, normalizedName],
    );

    response.status(201).json({
      message: "Account created successfully.",
      user: {
        id: userId,
        email: normalizedEmail,
        displayName: normalizedName,
      },
    });
  } catch (error) {
    console.error(error);

    response.status(500).json({
      message: "Unable to create account.",
    });
  }
});

app.post("/api/auth/login", async (request, response) => {
  try {
    const { email, password } = request.body;

    if (typeof email !== "string" || typeof password !== "string") {
      response.status(400).json({
        message: "Email and password are required.",
      });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    const [rows] = await database.query(
      `
        select id, email, password_hash, display_name, avatar_path
        from users
        where email = ?
        limit 1
      `,
      [normalizedEmail],
    );

    const users = rows as Array<{
      id: string;
      email: string;
      password_hash: string;
      display_name: string;
      avatar_path: string | null;
    }>;

    const user = users[0];

    if (!user) {
      response.status(401).json({
        message: "Invalid email or password.",
      });
      return;
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash,
    );

    if (!passwordMatches) {
      response.status(401).json({
        message: "Invalid email or password.",
      });
      return;
    }

    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        displayName: user.display_name,
      },
      jwtSecret,
      { expiresIn: "7d" },
    );

    response.json({
      message: "Login successful.",
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        avatarPath: user.avatar_path,
      },
    });
  } catch (error) {
    console.error(error);

    response.status(500).json({
      message: "Unable to log in.",
    });
  }
});

app.get("/api/my/works", requireAuth, async (_request, response) => {
  try {
    const currentUserId = response.locals.userId as string;

    const [works] = await database.query(
      `
        select
          works.id,
          works.author_id,
          users.display_name as owner_name,
          works.title,
          works.work_type,
          works.content_json,
          works.created_at,
          works.updated_at,
          case
            when works.author_id = ? then 'owner'
            when exists (
              select 1
              from work_collaborators
              where work_collaborators.work_id = works.id
                and work_collaborators.user_id = ?
                and work_collaborators.role = 'editor'
            ) then 'editor'
            else 'viewer'
          end as access_role
        from works
        inner join users
          on works.author_id = users.id
        where works.author_id = ?
          or exists (
            select 1
            from work_collaborators
            where work_collaborators.work_id = works.id
              and work_collaborators.user_id = ?
          )
        order by works.updated_at desc
      `,
      [
        currentUserId,
        currentUserId,
        currentUserId,
        currentUserId,
      ],
    );

    response.json({ works });
  } catch (error) {
    console.error(error);

    response.status(500).json({
      message: "Unable to load your works.",
    });
  }
});

app.get("/api/my/works/:workId", requireAuth, async (request, response) => {
  try {
    const currentUserId = response.locals.userId as string;

    const [rows] = await database.query(
      `
        select
          id,
          author_id,
          current_version,
          case
            when author_id = ? then 'owner'
            when exists (
              select 1
              from work_collaborators
              where work_collaborators.work_id = works.id
                and work_collaborators.user_id = ?
                and work_collaborators.role = 'editor'
            ) then 'editor'
            else 'viewer'
          end as access_role,
          title,
          work_type,
          content_json,
          description,
          cover_path,
          category,
          tags,
          is_published,
          allow_comments,
          published_at,
          created_at,
          updated_at
        from works
        where id = ?
          and (
            author_id = ?
            or exists (
              select 1
              from work_collaborators
              where work_collaborators.work_id = works.id
                and work_collaborators.user_id = ?
            )
          )
        limit 1
      `,
      [
        currentUserId,
        currentUserId,
        request.params.workId,
        currentUserId,
        currentUserId,
      ],
    );

    const works = rows as unknown[];

    if (works.length === 0) {
      response.status(404).json({
        message: "Work not found.",
      });
      return;
    }

    response.json({
      work: works[0],
    });
  } catch (error) {
    console.error(error);

    response.status(500).json({
      message: "Unable to load this work.",
    });
  }
});

app.get(
  "/api/my/works/:workId/draft",
  requireAuth,
  async (request, response) => {
    try {
      const currentUserId =
        response.locals.userId as string;

      const [accessRows] = await database.query(
        `
          select
            works.current_version
          from works
          inner join work_collaborators
            on work_collaborators.work_id = works.id
          where works.id = ?
            and work_collaborators.user_id = ?
            and work_collaborators.role = 'editor'
          limit 1
        `,
        [
          request.params.workId,
          currentUserId,
        ],
      );

      const access = accessRows as Array<{
        current_version: number;
      }>;

      if (!access[0]) {
        response.status(403).json({
          message:
            "Only editor collaborators can access a private draft.",
        });
        return;
      }

      const [draftRows] = await database.query(
        `
          select
            id,
            draft_title,
            draft_content_json,
            base_version,
            created_at,
            updated_at
          from work_drafts
          where work_id = ?
            and user_id = ?
          limit 1
        `,
        [
          request.params.workId,
          currentUserId,
        ],
      );

      const drafts = draftRows as Array<{
        id: string;
        draft_title: string;
        draft_content_json: unknown;
        base_version: number;
        created_at: string;
        updated_at: string;
      }>;

      response.json({
        currentVersion:
          access[0].current_version,
        draft: drafts[0] ?? null,
      });
    } catch (error) {
      console.error(error);

      response.status(500).json({
        message: "Unable to load your private draft.",
      });
    }
  },
);

app.put(
  "/api/my/works/:workId/draft",
  requireAuth,
  async (request, response) => {
    try {
      const currentUserId =
        response.locals.userId as string;

      const {
        title,
        contentJson,
        baseVersion,
      } = request.body;

      if (
        contentJson === undefined ||
        !Number.isInteger(baseVersion)
      ) {
        response.status(400).json({
          message:
            "Draft content and base version are required.",
        });
        return;
      }

      const [accessRows] = await database.query(
        `
          select works.id
          from works
          inner join work_collaborators
            on work_collaborators.work_id = works.id
          where works.id = ?
            and work_collaborators.user_id = ?
            and work_collaborators.role = 'editor'
          limit 1
        `,
        [
          request.params.workId,
          currentUserId,
        ],
      );

      if ((accessRows as unknown[]).length === 0) {
        response.status(403).json({
          message:
            "Only editor collaborators can save a private draft.",
        });
        return;
      }

      const finalTitle =
        typeof title === "string" && title.trim()
          ? title.trim()
          : "Untitled Work";

      await database.query(
        `
          insert into work_drafts (
            id,
            work_id,
            user_id,
            draft_title,
            draft_content_json,
            base_version
          )
          values (?, ?, ?, ?, ?, ?)
          on duplicate key update
            draft_title = values(draft_title),
            draft_content_json =
              values(draft_content_json),
            updated_at = current_timestamp(3)
        `,
        [
          randomUUID(),
          request.params.workId,
          currentUserId,
          finalTitle,
          JSON.stringify(contentJson),
          baseVersion,
        ],
      );

      response.json({
        message: "Private draft saved successfully.",
      });
    } catch (error) {
      console.error(error);

      response.status(500).json({
        message: "Unable to save your private draft.",
      });
    }
  },
);

app.post(
  "/api/my/works/:workId/draft/reload",
  requireAuth,
  async (request, response) => {
    try {
      const currentUserId =
        response.locals.userId as string;

      const { workId } = request.params;

      const [workRows] = await database.query(
        `
          select
            works.id,
            works.title,
            works.content_json,
            works.current_version
          from works
          inner join work_collaborators
            on work_collaborators.work_id = works.id
          where works.id = ?
            and work_collaborators.user_id = ?
            and work_collaborators.role = 'editor'
          limit 1
        `,
        [
          workId,
          currentUserId,
        ],
      );

      const works = workRows as Array<{
        id: string;
        title: string;
        content_json: unknown;
        current_version: number;
      }>;

      const work = works[0];

      if (!work) {
        response.status(403).json({
          message:
            "Only editor collaborators can reload a private draft.",
        });
        return;
      }

      const [pendingRequestRows] = await database.query(
        `
          select id
          from work_change_requests
          where work_id = ?
            and requester_id = ?
            and status = 'pending'
          limit 1
        `,
        [
          workId,
          currentUserId,
        ],
      );

      if ((pendingRequestRows as unknown[]).length > 0) {
        response.status(409).json({
          message:
            "Withdraw your pending submission before reloading the latest official version.",
        });
        return;
      }

      await database.query(
        `
          insert into work_drafts (
            id,
            work_id,
            user_id,
            draft_title,
            draft_content_json,
            base_version
          )
          values (?, ?, ?, ?, ?, ?)
          on duplicate key update
            draft_title = values(draft_title),
            draft_content_json =
              values(draft_content_json),
            base_version = values(base_version),
            updated_at = current_timestamp(3)
        `,
        [
          randomUUID(),
          workId,
          currentUserId,
          work.title,
          JSON.stringify(work.content_json),
          work.current_version,
        ],
      );

      response.json({
        message:
          "Private draft was reloaded from the latest official version.",
        draft: {
          title: work.title,
          contentJson: work.content_json,
          baseVersion: work.current_version,
        },
      });
    } catch (error) {
      console.error(error);

      response.status(500).json({
        message:
          "Unable to reload the latest official version.",
      });
    }
  },
);

app.post(
  "/api/my/works/:workId/change-requests",
  requireAuth,
  async (request, response) => {
    try {
      const currentUserId =
        response.locals.userId as string;

      const { workId } = request.params;

      const [accessRows] = await database.query(
        `
          select works.id
          from works
          inner join work_collaborators
            on work_collaborators.work_id = works.id
          where works.id = ?
            and work_collaborators.user_id = ?
            and work_collaborators.role = 'editor'
          limit 1
        `,
        [
          workId,
          currentUserId,
        ],
      );

      if ((accessRows as unknown[]).length === 0) {
        response.status(403).json({
          message:
            "Only editor collaborators can submit changes.",
        });
        return;
      }

      const [draftRows] = await database.query(
        `
          select
            id,
            draft_title,
            draft_content_json,
            base_version
          from work_drafts
          where work_id = ?
            and user_id = ?
          limit 1
        `,
        [
          workId,
          currentUserId,
        ],
      );

      const drafts = draftRows as Array<{
        id: string;
        draft_title: string;
        draft_content_json: unknown;
        base_version: number;
      }>;

      const draft = drafts[0];

      if (!draft) {
        response.status(400).json({
          message:
            "Save a private draft before submitting changes.",
        });
        return;
      }

      const [pendingRows] = await database.query(
        `
          select id
          from work_change_requests
          where work_id = ?
            and requester_id = ?
            and status = 'pending'
          limit 1
        `,
        [
          workId,
          currentUserId,
        ],
      );

      if ((pendingRows as unknown[]).length > 0) {
        response.status(409).json({
          message:
            "You already have changes waiting for review.",
        });
        return;
      }

      const requestId = randomUUID();

      await database.query(
        `
          insert into work_change_requests (
            id,
            work_id,
            requester_id,
            draft_id,
            submitted_title,
            submitted_content_json,
            base_version,
            status
          )
          values (?, ?, ?, ?, ?, ?, ?, 'pending')
        `,
        [
          requestId,
          workId,
          currentUserId,
          draft.id,
          draft.draft_title,
          JSON.stringify(
            draft.draft_content_json,
          ),
          draft.base_version,
        ],
      );

      const [userRows] = await database.query(
        `
          select display_name
          from users
          where id = ?
          limit 1
        `,
        [currentUserId],
      );

      const users = userRows as Array<{
        display_name: string;
      }>;

      const [ownerRows] = await database.query(
        `
          select author_id
          from works
          where id = ?
          limit 1
        `,
        [workId],
      );

      const owners = ownerRows as Array<{
        author_id: string;
      }>;

      const owner = owners[0];

      if (owner) {
        await database.query(
          `
            insert into notifications (
              id,
              user_id,
              notification_type,
              message,
              work_id
            )
            values (?, ?, ?, ?, ?)
          `,
          [
            randomUUID(),
            owner.author_id,
            "change_submitted",
            `${
              users[0]?.display_name ?? "A collaborator"
            } submitted changes for review.`,
            workId,
          ],
        );
      }

      if (owner) {
        io.to(`user:${owner.author_id}`).emit(
          "notification-created",
          {
            userId: owner.author_id,
          },
        );
      }

      io.to(`work:${workId}`).emit(
        "changes-submitted",
        {
          workId,
          requesterId: currentUserId,
          requesterName:
            users[0]?.display_name ??
            "A collaborator",
        },
      );

      response.status(201).json({
        message:
          "Changes submitted for review.",
        changeRequestId: requestId,
      });
    } catch (error) {
      console.error(error);

      response.status(500).json({
        message:
          "Unable to submit changes for review.",
      });
    }
  },
);

app.get(
  "/api/my/works/:workId/change-requests",
  requireAuth,
  async (request, response) => {
    try {
      const currentUserId =
        response.locals.userId as string;

      const { workId } = request.params;

      const requestedStatus =
        request.query.status;

      const status =
        requestedStatus === "accepted" ||
        requestedStatus === "rejected" ||
        requestedStatus === "withdrawn"
          ? requestedStatus
          : "pending";

      const [ownerRows] = await database.query(
        `
          select id
          from works
          where id = ?
            and author_id = ?
          limit 1
        `,
        [
          workId,
          currentUserId,
        ],
      );

      if ((ownerRows as unknown[]).length === 0) {
        response.status(403).json({
          message:
            "Only the work owner can view the review queue.",
        });
        return;
      }

      const [requestRows] = await database.query(
        `
          select
            work_change_requests.id,
            work_change_requests.work_id,
            work_change_requests.requester_id,
            work_change_requests.draft_id,
            work_change_requests.submitted_title,
            work_change_requests.submitted_content_json,
            work_change_requests.base_version,
            work_change_requests.status,
            work_change_requests.review_comment,
            work_change_requests.reviewed_by,
            work_change_requests.reviewed_at,
            work_change_requests.created_at,
            work_change_requests.updated_at,

            users.display_name as requester_name,
            users.avatar_path as requester_avatar_path

          from work_change_requests
          inner join users
            on users.id =
              work_change_requests.requester_id

          where work_change_requests.work_id = ?
            and work_change_requests.status = ?

          order by
            work_change_requests.created_at asc
        `,
        [
          workId,
          status,
        ],
      );

      response.json({
        requests: requestRows,
      });
    } catch (error) {
      console.error(error);

      response.status(500).json({
        message:
          "Unable to load the review queue.",
      });
    }
  },
);

app.get(
  "/api/my/works/:workId/change-requests/mine",
  requireAuth,
  async (request, response) => {
    try {
      const currentUserId =
        response.locals.userId as string;

      const { workId } = request.params;

      const [accessRows] = await database.query(
        `
          select works.id
          from works
          inner join work_collaborators
            on work_collaborators.work_id = works.id
          where works.id = ?
            and work_collaborators.user_id = ?
            and work_collaborators.role = 'editor'
          limit 1
        `,
        [
          workId,
          currentUserId,
        ],
      );

      if ((accessRows as unknown[]).length === 0) {
        response.status(403).json({
          message:
            "Only editor collaborators can view their submitted changes.",
        });
        return;
      }

      const [requestRows] = await database.query(
        `
          select
            id,
            submitted_title,
            base_version,
            status,
            review_comment,
            reviewed_at,
            created_at,
            updated_at
          from work_change_requests
          where work_id = ?
            and requester_id = ?
          order by created_at desc
        `,
        [
          workId,
          currentUserId,
        ],
      );

      response.json({
        requests: requestRows,
      });
    } catch (error) {
      console.error(error);

      response.status(500).json({
        message:
          "Unable to load your submitted changes.",
      });
    }
  },
);

app.delete(
  "/api/my/works/:workId/change-requests/:changeRequestId",
  requireAuth,
  async (request, response) => {
    try {
      const currentUserId =
        response.locals.userId as string;

      const { workId, changeRequestId } =
        request.params;

      const [accessRows] = await database.query(
        `
          select works.id
          from works
          inner join work_collaborators
            on work_collaborators.work_id = works.id
          where works.id = ?
            and work_collaborators.user_id = ?
            and work_collaborators.role = 'editor'
          limit 1
        `,
        [
          workId,
          currentUserId,
        ],
      );

      if ((accessRows as unknown[]).length === 0) {
        response.status(403).json({
          message:
            "Only editor collaborators can withdraw their submissions.",
        });
        return;
      }

      const [updateResult] = await database.query(
        `
          update work_change_requests
          set
            status = 'withdrawn',
            updated_at = now()
          where id = ?
            and work_id = ?
            and requester_id = ?
            and status = 'pending'
        `,
        [
          changeRequestId,
          workId,
          currentUserId,
        ],
      );

      const result = updateResult as {
        affectedRows: number;
      };

      if (result.affectedRows === 0) {
        response.status(400).json({
          message:
            "Only a pending submission can be withdrawn.",
        });
        return;
      }

      io.to(`work:${workId}`).emit(
        "changes-withdrawn",
        {
          workId,
          requesterId: currentUserId,
          changeRequestId,
        },
      );

      response.json({
        message:
          "Submission withdrawn successfully.",
      });
    } catch (error) {
      console.error(error);

      response.status(500).json({
        message:
          "Unable to withdraw the submission.",
      });
    }
  },
);

app.put(
  "/api/my/works/:workId/change-requests/:changeRequestId/review",
  requireAuth,
  async (request, response) => {
    const connection =
      await database.getConnection();

    try {
      const currentUserId =
        response.locals.userId as string;

      const { workId, changeRequestId } =
        request.params;

      const {
        decision,
        reviewComment,
      } = request.body;

      if (
        decision !== "accept" &&
        decision !== "reject"
      ) {
        response.status(400).json({
          message:
            "Review decision must be accept or reject.",
        });
        return;
      }

      const finalReviewComment =
        typeof reviewComment === "string"
          ? reviewComment.trim()
          : "";

      if (
        decision === "reject" &&
        !finalReviewComment
      ) {
        response.status(400).json({
          message:
            "A rejection reason is required.",
        });
        return;
      }

      await connection.beginTransaction();

      const [ownerRows] = await connection.query(
        `
          select
            id,
            current_version
          from works
          where id = ?
            and author_id = ?
          limit 1
          for update
        `,
        [
          workId,
          currentUserId,
        ],
      );

      const owners = ownerRows as Array<{
        id: string;
        current_version: number;
      }>;

      const ownerWork = owners[0];

      if (!ownerWork) {
        await connection.rollback();

        response.status(403).json({
          message:
            "Only the work owner can review changes.",
        });
        return;
      }

      const [changeRequestRows] =
        await connection.query(
          `
            select
              work_change_requests.id,
              work_change_requests.draft_id,
              work_change_requests.requester_id,
              work_change_requests.submitted_title,
              work_change_requests.submitted_content_json,
              work_change_requests.base_version,
              work_change_requests.status,
              users.display_name as requester_name

            from work_change_requests
            inner join users
              on users.id =
                work_change_requests.requester_id

            where work_change_requests.id = ?
              and work_change_requests.work_id = ?
            limit 1
            for update
          `,
          [
            changeRequestId,
            workId,
          ],
        );

      const changeRequests =
        changeRequestRows as Array<{
          id: string;
          draft_id: string | null;
          requester_id: string;
          submitted_title: string;
          submitted_content_json: unknown;
          base_version: number;
          status:
            | "pending"
            | "accepted"
            | "rejected"
            | "withdrawn";
          requester_name: string;
        }>;

      const changeRequest =
        changeRequests[0];

      if (!changeRequest) {
        await connection.rollback();

        response.status(404).json({
          message:
            "Change request not found.",
        });
        return;
      }

      if (
        changeRequest.status !== "pending"
      ) {
        await connection.rollback();

        response.status(409).json({
          message:
            "This change request has already been reviewed.",
        });
        return;
      }

      if (decision === "reject") {
        await connection.query(
          `
            update work_change_requests
            set
              status = 'rejected',
              review_comment = ?,
              reviewed_by = ?,
              reviewed_at = current_timestamp(3)
            where id = ?
          `,
          [
            finalReviewComment,
            currentUserId,
            changeRequestId,
          ],
        );

        await connection.query(
          `
            insert into notifications (
              id,
              user_id,
              notification_type,
              message,
              work_id
            )
            values (?, ?, ?, ?, ?)
          `,
          [
            randomUUID(),
            changeRequest.requester_id,
            "change_rejected",
            `Your changes need revision: ${finalReviewComment}`,
            workId,
          ],
        );

        await connection.commit();

        io.to(
          `user:${changeRequest.requester_id}`,
        ).emit("notification-created", {
          userId: changeRequest.requester_id,
        });

        io.to(`work:${workId}`).emit(
          "changes-rejected",
          {
            workId,
            requesterId:
              changeRequest.requester_id,
            reviewComment: finalReviewComment,
          },
        );

        response.json({
          message: "Changes rejected.",
        });

        return;
      }

      if (
        changeRequest.base_version !==
        ownerWork.current_version
      ) {
        await connection.rollback();

        response.status(409).json({
          message:
            "This change request is based on an older version of the work. Ask the collaborator to refresh and submit again.",
        });

        return;
      }

      const submittedContentJson =
        typeof changeRequest.submitted_content_json ===
        "string"
          ? changeRequest.submitted_content_json
          : JSON.stringify(
              changeRequest.submitted_content_json,
            );

      const [updateResult] =
        await connection.query(
          `
            update works
            set
              title = ?,
              content_json = ?,
              current_version = current_version + 1,
              updated_at = current_timestamp(3)
            where id = ?
              and current_version = ?
          `,
          [
            changeRequest.submitted_title,
            submittedContentJson,
            workId,
            ownerWork.current_version,
          ],
        );

      const workUpdate = updateResult as {
        affectedRows: number;
      };

      if (workUpdate.affectedRows === 0) {
        await connection.rollback();

        response.status(409).json({
          message:
            "The official work changed while this request was being reviewed.",
        });

        return;
      }

      await connection.query(
        `
          update work_change_requests
          set
            status = 'accepted',
            review_comment = ?,
            reviewed_by = ?,
            reviewed_at = current_timestamp(3)
          where id = ?
        `,
        [
          finalReviewComment || null,
          currentUserId,
          changeRequestId,
        ],
      );

      if (changeRequest.draft_id) {
        await connection.query(
          `
            delete from work_drafts
            where id = ?
          `,
          [changeRequest.draft_id],
        );
      }

      await connection.query(
        `
          insert into notifications (
            id,
            user_id,
            notification_type,
            message,
            work_id
          )
          values (?, ?, ?, ?, ?)
        `,
        [
          randomUUID(),
          changeRequest.requester_id,
          "change_accepted",
          "Your changes were accepted. Refresh to new version.",
          workId,
        ],
      );

      await connection.commit();

      io.to(
        `user:${changeRequest.requester_id}`,
      ).emit("notification-created", {
        userId: changeRequest.requester_id,
      });

      io.to(`work:${workId}`).emit(
        "changes-accepted",
        {
          workId,
          requesterName:
            changeRequest.requester_name,
        },
      );

      response.json({
        message: "Changes accepted.",
        currentVersion:
          ownerWork.current_version + 1,
      });
    } catch (error) {
      await connection.rollback();

      console.error(error);

      response.status(500).json({
        message:
          "Unable to review this change request.",
      });
    } finally {
      connection.release();
    }
  },
);

app.get(
  "/api/my/notifications",
  requireAuth,
  async (request, response) => {
    try {
      const currentUserId =
        response.locals.userId as string;

      const [notificationRows] = await database.query(
        `
          select
            id,
            notification_type,
            message,
            work_id,
            is_read,
            created_at
          from notifications
          where user_id = ?
          order by created_at desc
          limit 50
        `,
        [currentUserId],
      );

      response.json({
        notifications: notificationRows,
      });
    } catch (error) {
      console.error(error);

      response.status(500).json({
        message: "Unable to load notifications.",
      });
    }
  },
);

app.put(
  "/api/my/notifications/:notificationId/read",
  requireAuth,
  async (request, response) => {
    try {
      const currentUserId =
        response.locals.userId as string;

      const { notificationId } = request.params;

      const [updateResult] = await database.query(
        `
          update notifications
          set is_read = true
          where id = ?
            and user_id = ?
        `,
        [
          notificationId,
          currentUserId,
        ],
      );

      const result = updateResult as {
        affectedRows: number;
      };

      if (result.affectedRows === 0) {
        response.status(404).json({
          message: "Notification not found.",
        });
        return;
      }

      response.json({
        message: "Notification marked as read.",
      });
    } catch (error) {
      console.error(error);

      response.status(500).json({
        message: "Unable to update notification.",
      });
    }
  },
);

app.put(
  "/api/my/notifications/read-all",
  requireAuth,
  async (request, response) => {
    try {
      const currentUserId =
        response.locals.userId as string;

      await database.query(
        `
          update notifications
          set is_read = true
          where user_id = ?
            and is_read = false
        `,
        [currentUserId],
      );

      response.json({
        message: "All notifications marked as read.",
      });
    } catch (error) {
      console.error(error);

      response.status(500).json({
        message: "Unable to update notifications.",
      });
    }
  },
);

app.post(
  "/api/my/projects",
  requireAuth,
  async (request, response) => {
    try {
      const currentUserId =
        response.locals.userId as string;

      const {
        title,
        description,
      } = request.body;

      if (
        typeof title !== "string" ||
        !title.trim()
      ) {
        response.status(400).json({
          message: "A project title is required.",
        });
        return;
      }

      const projectId = randomUUID();

      const finalTitle = title.trim().slice(0, 150);

      const finalDescription =
        typeof description === "string"
          ? description.trim()
          : "";

      await database.query(
        `
          insert into projects (
            id,
            owner_id,
            title,
            description
          )
          values (?, ?, ?, ?)
        `,
        [
          projectId,
          currentUserId,
          finalTitle,
          finalDescription,
        ],
      );

      response.status(201).json({
        message: "Project created successfully.",
        project: {
          id: projectId,
          title: finalTitle,
          description: finalDescription,
          coverPath: null,
          itemCount: 0,
        },
      });
    } catch (error) {
      console.error(error);

      response.status(500).json({
        message: "Unable to create the project.",
      });
    }
  },
);

app.get(
  "/api/my/projects",
  requireAuth,
  async (request, response) => {
    try {
      const currentUserId =
        response.locals.userId as string;

      const [projectRows] = await database.query(
        `
          select
            projects.id,
            projects.title,
            projects.description,
            projects.cover_path,
            projects.created_at,
            projects.updated_at,
            count(project_items.id) as item_count
          from projects
          left join project_items
            on project_items.project_id = projects.id
          where projects.owner_id = ?
          group by
            projects.id,
            projects.title,
            projects.description,
            projects.cover_path,
            projects.created_at,
            projects.updated_at
          order by projects.updated_at desc
        `,
        [currentUserId],
      );

      response.json({
        projects: projectRows,
      });
    } catch (error) {
      console.error(error);

      response.status(500).json({
        message: "Unable to load your projects.",
      });
    }
  },
);

app.get(
  "/api/my/projects/:projectId",
  requireAuth,
  async (request, response) => {
    try {
      const currentUserId =
        response.locals.userId as string;

      const { projectId } = request.params;

      const [projectRows] = await database.query(
        `
          select
            id,
            title,
            description,
            cover_path,
            category,
            tags,
            is_published,
            allow_comments,
            published_at,
            created_at,
            updated_at
          from projects
          where id = ?
            and owner_id = ?
          limit 1
        `,
        [
          projectId,
          currentUserId,
        ],
      );

      const projects = projectRows as Array<{
        id: string;
        title: string;
        description: string;
        cover_path: string | null;
        category: string | null;
        tags: string[] | string;
        is_published: boolean;
        allow_comments: boolean;
        published_at: string | null;
        created_at: string;
        updated_at: string;
      }>;

      const project = projects[0];

      if (!project) {
        response.status(404).json({
          message: "Project not found.",
        });
        return;
      }

      const [itemRows] = await database.query(
        `
          select
            project_items.id as project_item_id,
            project_items.item_role,
            project_items.sort_order,
            project_items.created_at as added_at,

            works.id as work_id,
            works.title as work_title,
            works.work_type,
            works.updated_at as work_updated_at
          from project_items
          inner join works
            on works.id = project_items.work_id
          where project_items.project_id = ?
          order by
            project_items.sort_order asc,
            project_items.created_at asc
        `,
        [projectId],
      );

      response.json({
        project,
        items: itemRows,
      });
    } catch (error) {
      console.error(error);

      response.status(500).json({
        message: "Unable to load this project.",
      });
    }
  },
);

app.delete(
  "/api/my/projects/:projectId",
  requireAuth,
  async (request, response) => {
    try {
      const currentUserId =
        response.locals.userId as string;

      const { projectId } = request.params;

      const [projectRows] = await database.query(
        `
          select id
          from projects
          where id = ?
            and owner_id = ?
          limit 1
        `,
        [
          projectId,
          currentUserId,
        ],
      );

      if ((projectRows as unknown[]).length === 0) {
        response.status(404).json({
          message:
            "Project not found or you do not have permission to delete it.",
        });
        return;
      }

      await database.query(
        `
          delete from projects
          where id = ?
            and owner_id = ?
        `,
        [
          projectId,
          currentUserId,
        ],
      );

      response.json({
        message: "Project deleted successfully.",
      });
    } catch (error) {
      console.error(error);

      response.status(500).json({
        message: "Unable to delete the project.",
      });
    }
  },
);

app.put(
  "/api/my/projects/:projectId",
  requireAuth,
  async (request, response) => {
    try {
      const currentUserId =
        response.locals.userId as string;

      const { projectId } = request.params;

      const {
        title,
        description,
      } = request.body;

      if (
        typeof title !== "string" ||
        !title.trim()
      ) {
        response.status(400).json({
          message: "A project title is required.",
        });
        return;
      }

      const finalTitle = title.trim().slice(0, 150);

      const finalDescription =
        typeof description === "string"
          ? description.trim()
          : "";

      const [updateResult] = await database.query(
        `
          update projects
          set
            title = ?,
            description = ?,
            updated_at = current_timestamp(3)
          where id = ?
            and owner_id = ?
        `,
        [
          finalTitle,
          finalDescription,
          projectId,
          currentUserId,
        ],
      );

      const result = updateResult as {
        affectedRows: number;
      };

      if (result.affectedRows === 0) {
        response.status(404).json({
          message:
            "Project not found or you do not have permission to edit it.",
        });
        return;
      }

      response.json({
        message: "Project updated successfully.",
        project: {
          id: projectId,
          title: finalTitle,
          description: finalDescription,
        },
      });
    } catch (error) {
      console.error(error);

      response.status(500).json({
        message: "Unable to update the project.",
      });
    }
  },
);

app.put(
  "/api/my/projects/:projectId/cover",
  requireAuth,
  async (request, response) => {
    try {
      const currentUserId =
        response.locals.userId as string;

      const { projectId } = request.params;

      const { coverPath } = request.body;

      if (
        coverPath !== null &&
        typeof coverPath !== "string"
      ) {
        response.status(400).json({
          message:
            "Cover path must be a string or null.",
        });
        return;
      }

      let finalCoverPath: string | null = null;

      if (typeof coverPath === "string") {
        const normalizedPath =
          coverPath.replaceAll("\\", "/");

        const userUploadsDirectory = path.resolve(
          uploadsDirectory,
          currentUserId,
        );

        const coverFilePath = path.resolve(
          uploadsDirectory,
          normalizedPath,
        );

        const isInsideUserUploads =
          coverFilePath.startsWith(
            `${userUploadsDirectory}${path.sep}`,
          );

        if (
          !isInsideUserUploads ||
          !fs.existsSync(coverFilePath)
        ) {
          response.status(400).json({
            message:
              "Choose an image from your own uploaded files.",
          });
          return;
        }

        finalCoverPath = normalizedPath;
      }

      const [updateResult] = await database.query(
        `
          update projects
          set
            cover_path = ?,
            updated_at = current_timestamp(3)
          where id = ?
            and owner_id = ?
        `,
        [
          finalCoverPath,
          projectId,
          currentUserId,
        ],
      );

      const result = updateResult as {
        affectedRows: number;
      };

      if (result.affectedRows === 0) {
        response.status(404).json({
          message:
            "Project not found or you do not have permission to edit it.",
        });
        return;
      }

      response.json({
        message: "Project cover updated successfully.",
        coverPath: finalCoverPath,
      });
    } catch (error) {
      console.error(error);

      response.status(500).json({
        message:
          "Unable to update the project cover.",
      });
    }
  },
);

app.post(
  "/api/my/projects/:projectId/items",
  requireAuth,
  async (request, response) => {
    try {
      const currentUserId =
        response.locals.userId as string;

      const { projectId } = request.params;

      const {
        workId,
        itemRole,
      } = request.body;

      const allowedItemRoles = [
        "chapter",
        "character",
        "scene",
        "cover",
        "inspiration",
        "other",
      ];

      if (
        typeof workId !== "string" ||
        !workId ||
        typeof itemRole !== "string" ||
        !allowedItemRoles.includes(itemRole)
      ) {
        response.status(400).json({
          message:
            "A valid work and item role are required.",
        });
        return;
      }

      const [projectRows] = await database.query(
        `
          select id
          from projects
          where id = ?
            and owner_id = ?
          limit 1
        `,
        [
          projectId,
          currentUserId,
        ],
      );

      if ((projectRows as unknown[]).length === 0) {
        response.status(404).json({
          message: "Project not found.",
        });
        return;
      }

      /*
       * At this stage, users may add only
       * works they own. Shared works can be
       * supported later with project roles.
       */
      const [workRows] = await database.query(
        `
          select id
          from works
          where id = ?
            and author_id = ?
          limit 1
        `,
        [
          workId,
          currentUserId,
        ],
      );

      if ((workRows as unknown[]).length === 0) {
        response.status(403).json({
          message:
            "You can only add your own works to a project.",
        });
        return;
      }

      const [existingItemRows] =
        await database.query(
          `
            select id
            from project_items
            where project_id = ?
              and work_id = ?
            limit 1
          `,
          [
            projectId,
            workId,
          ],
        );

      if ((existingItemRows as unknown[]).length > 0) {
        response.status(409).json({
          message:
            "This work is already part of the project.",
        });
        return;
      }

      const [sortRows] = await database.query(
        `
          select
            coalesce(max(sort_order), -1) + 1
              as next_sort_order
          from project_items
          where project_id = ?
        `,
        [projectId],
      );

      const sortValues = sortRows as Array<{
        next_sort_order: number;
      }>;

      const nextSortOrder =
        sortValues[0]?.next_sort_order ?? 0;

      const projectItemId = randomUUID();

      await database.query(
        `
          insert into project_items (
            id,
            project_id,
            work_id,
            item_role,
            sort_order
          )
          values (?, ?, ?, ?, ?)
        `,
        [
          projectItemId,
          projectId,
          workId,
          itemRole,
          nextSortOrder,
        ],
      );

      await database.query(
        `
          update projects
          set updated_at = current_timestamp(3)
          where id = ?
        `,
        [projectId],
      );

      response.status(201).json({
        message:
          "Work added to the project.",
        item: {
          id: projectItemId,
          workId,
          itemRole,
          sortOrder: nextSortOrder,
        },
      });
    } catch (error) {
      console.error(error);

      response.status(500).json({
        message:
          "Unable to add this work to the project.",
      });
    }
  },
);

app.put(
  "/api/my/projects/:projectId/items/reorder",
  requireAuth,
  async (request, response) => {
    const connection =
      await database.getConnection();

    try {
      const currentUserId =
        response.locals.userId as string;

      const { projectId } = request.params;
      const { itemIds } = request.body;

      if (
        !Array.isArray(itemIds) ||
        itemIds.some(
          (itemId) =>
            typeof itemId !== "string" ||
            !itemId,
        )
      ) {
        response.status(400).json({
          message:
            "A valid project item order is required.",
        });

        return;
      }

      const uniqueItemIds = [
        ...new Set(itemIds),
      ];

      if (uniqueItemIds.length !== itemIds.length) {
        response.status(400).json({
          message:
            "The project item order contains duplicate items.",
        });

        return;
      }

      await connection.beginTransaction();

      const [projectRows] =
        await connection.query(
          `
            select id
            from projects
            where id = ?
              and owner_id = ?
            limit 1
            for update
          `,
          [
            projectId,
            currentUserId,
          ],
        );

      if ((projectRows as unknown[]).length === 0) {
        await connection.rollback();

        response.status(404).json({
          message:
            "Project not found or you do not have permission to reorder it.",
        });
        return;
      }

      const [currentItemRows] =
        await connection.query(
          `
            select id
            from project_items
            where project_id = ?
          `,
          [projectId],
        );

      const currentItems =
        currentItemRows as Array<{
          id: string;
        }>;

      const currentItemIds = new Set(
        currentItems.map((item) => item.id),
      );

      const containsEveryItem =
        itemIds.length === currentItems.length &&
        itemIds.every((itemId) =>
          currentItemIds.has(itemId),
        );

      if (!containsEveryItem) {
        await connection.rollback();

        response.status(400).json({
          message:
            "The new order must contain every project item exactly once.",
        });
        return;
      }

      for (
        let index = 0;
        index < itemIds.length;
        index += 1
      ) {
        await connection.query(
          `
            update project_items
            set sort_order = ?
            where id = ?
              and project_id = ?
          `,
          [
            index,
            itemIds[index],
            projectId,
          ],
        );
      }

      await connection.query(
        `
          update projects
          set updated_at = current_timestamp(3)
          where id = ?
        `,
        [projectId],
      );

      await connection.commit();

      response.json({
        message:
          "Project items reordered successfully.",
      });
    } catch (error) {
      await connection.rollback();

      console.error(error);

      response.status(500).json({
        message:
          "Unable to reorder project items.",
      });
    } finally {
      connection.release();
    }
  },
);

app.put(
  "/api/my/projects/:projectId/items/:projectItemId/role",
  requireAuth,
  async (request, response) => {
    try {
      const currentUserId =
        response.locals.userId as string;

      const {
        projectId,
        projectItemId,
      } = request.params;

      const { itemRole } = request.body;

      const allowedItemRoles = [
        "chapter",
        "character",
        "scene",
        "cover",
        "inspiration",
        "other",
      ];

      if (
        typeof itemRole !== "string" ||
        !allowedItemRoles.includes(itemRole)
      ) {
        response.status(400).json({
          message:
            "A valid project item role is required.",
        });
        return;
      }

      const [updateResult] = await database.query(
        `
          update project_items
          inner join projects
            on projects.id =
              project_items.project_id
          set
            project_items.item_role = ?,
            projects.updated_at =
              current_timestamp(3)
          where project_items.id = ?
            and project_items.project_id = ?
            and projects.owner_id = ?
        `,
        [
          itemRole,
          projectItemId,
          projectId,
          currentUserId,
        ],
      );

      const result = updateResult as {
        affectedRows: number;
      };

      if (result.affectedRows === 0) {
        response.status(404).json({
          message:
            "Project item not found or you do not have permission to edit it.",
        });
        return;
      }

      response.json({
        message:
          "Project item role updated successfully.",
        itemRole,
      });
    } catch (error) {
      console.error(error);

      response.status(500).json({
        message:
          "Unable to update the project item role.",
      });
    }
  },
);

app.delete(
  "/api/my/projects/:projectId/items/:projectItemId",
  requireAuth,
  async (request, response) => {
    try {
      const currentUserId =
        response.locals.userId as string;

      const {
        projectId,
        projectItemId,
      } = request.params;

      const [itemRows] = await database.query(
        `
          select project_items.id
          from project_items
          inner join projects
            on projects.id = project_items.project_id
          where project_items.id = ?
            and project_items.project_id = ?
            and projects.owner_id = ?
          limit 1
        `,
        [
          projectItemId,
          projectId,
          currentUserId,
        ],
      );

      if ((itemRows as unknown[]).length === 0) {
        response.status(404).json({
          message:
            "Project item not found or you do not have permission to remove it.",
        });
        return;
      }

      await database.query(
        `
          delete from project_items
          where id = ?
            and project_id = ?
        `,
        [
          projectItemId,
          projectId,
        ],
      );

      await database.query(
        `
          update projects
          set updated_at = current_timestamp(3)
          where id = ?
        `,
        [projectId],
      );

      response.json({
        message: "Work removed from the project.",
      });
    } catch (error) {
      console.error(error);

      response.status(500).json({
        message:
          "Unable to remove this work from the project.",
      });
    }
  },
);

app.post("/api/my/works", requireAuth, async (request, response) => {
  try {
    const { title, workType, contentJson } = request.body;

    if (
      typeof title !== "string" ||
      (workType !== "writing" && workType !== "drawing") ||
      contentJson === undefined
    ) {
      response.status(400).json({
        message: "Title, work type, and content are required.",
      });
      return;
    }

    const workId = randomUUID();
    const finalTitle = title.trim() || "Untitled Work";

    await database.query(
      `
        insert into works (
          id,
          author_id,
          title,
          work_type,
          content_json,
          description,
          tags
        )
        values (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        workId,
        response.locals.userId,
        finalTitle,
        workType,
        JSON.stringify(contentJson),
        "",
        JSON.stringify([]),
      ],
    );

    response.status(201).json({
      message: "Work created successfully.",
      work: {
        id: workId,
        title: finalTitle,
        workType,
        contentJson,
      },
    });
  } catch (error) {
    console.error(error);

    response.status(500).json({
      message: "Unable to create work.",
    });
  }
});

app.put("/api/my/works/:workId", requireAuth, async (request, response) => {
  try {
    const currentUserId = response.locals.userId as string;
    const { workId } = request.params;
    const { title, contentJson } = request.body;

    if (!contentJson) {
      response.status(400).json({
        message: "Work content is required.",
      });
      return;
    }

    const finalTitle =
      typeof title === "string" && title.trim()
        ? title.trim()
        : "Untitled Work";

    const [result] = await database.query<ResultSetHeader>(
      `
        UPDATE works AS target_work
        SET
          target_work.title = ?,
          target_work.content_json = ?,
          target_work.current_version =
            target_work.current_version + 1
        WHERE target_work.id = ?
          AND (
            target_work.author_id = ?
            OR EXISTS (
              SELECT 1
              FROM work_collaborators
              WHERE work_collaborators.work_id = target_work.id
                AND work_collaborators.user_id = ?
                AND work_collaborators.role = 'editor'
            )
          )
      `,
      [
        finalTitle,
        JSON.stringify(contentJson),
        workId,
        currentUserId,
        currentUserId,
      ],
    );

    if (result.affectedRows === 0) {
      response.status(403).json({
        message: "You do not have permission to edit this work.",
      });
      return;
    }

    io.to(`work:${workId}`).emit(
      "work-saved",
      {
        workId,
        savedBy: currentUserId,
      },
    );

    response.json({
      message: "Work saved successfully.",
    });
  } catch (error) {
    console.error(error);

    response.status(500).json({
      message: "Unable to save the work.",
    });
  }
});

app.post(
  "/api/uploads/images",
  requireAuth,
  imageUpload.array("images", 10),
  (request, response) => {
    const userId = (request as AuthenticatedRequest).userId;
    const files = (request.files ?? []) as Express.Multer.File[];

    if (!userId || files.length === 0) {
      response.status(400).json({
        message: "Please select at least one image.",
      });
      return;
    }

    response.status(201).json({
      images: files.map((file) => ({
        filePath: `${userId}/${file.filename}`,
        url: `http://localhost:${port}/uploads/${userId}/${file.filename}`,
        alt: file.originalname,
      })),
    });
  },
);

app.delete("/api/uploads/images", requireAuth, async (request, response) => {
  try {
    const { paths } = request.body;
    const userId = (request as AuthenticatedRequest).userId;

    if (!userId || !Array.isArray(paths)) {
      response.status(400).json({
        message: "Image paths are required.",
      });
      return;
    }

    const userUploadsDirectory = path.resolve(
      uploadsDirectory,
      userId,
    );

    for (const filePath of paths) {
      if (
        typeof filePath !== "string" ||
        !filePath.startsWith(`${userId}/`)
      ) {
        response.status(403).json({
          message: "You cannot delete this image.",
        });
        return;
      }

      const filename = filePath.slice(userId.length + 1);
      const targetPath = path.resolve(
        userUploadsDirectory,
        filename,
      );

      if (
        targetPath !== userUploadsDirectory &&
        !targetPath.startsWith(`${userUploadsDirectory}${path.sep}`)
      ) {
        response.status(403).json({
          message: "Invalid image path.",
        });
        return;
      }

      try {
        await fs.promises.unlink(targetPath);
      } catch (error) {
        const code =
          error instanceof Error && "code" in error
            ? error.code
            : null;

        if (code !== "ENOENT") {
          throw error;
        }
      }
    }

    response.json({
      message: "Images deleted successfully.",
    });
  } catch (error) {
    console.error(error);

    response.status(500).json({
      message: "Unable to delete images.",
    });
  }
});

app.delete("/api/my/works/:workId", requireAuth, async (request, response) => {
  try {
    const [result] = await database.query(
      `
        delete from works
        where id = ? and author_id = ?
      `,
      [request.params.workId, response.locals.userId],
    );

    const deleteResult = result as { affectedRows: number };

    if (deleteResult.affectedRows === 0) {
      response.status(404).json({
        message: "Work not found.",
      });
      return;
    }

    response.json({
      message: "Work deleted successfully.",
    });
  } catch (error) {
    console.error(error);

    response.status(500).json({
      message: "Unable to delete work.",
    });
  }
});

app.put(
  "/api/my/works/:workId/publication",
  requireAuth,
  async (request, response) => {
    try {
      const {
        title,
        description,
        category,
        tags,
        allowComments,
        coverPath,
      } = request.body;

      console.log("Publication request:", {
        title,
        description,
        category,
        tags,
        allowComments,
        coverPath,
      });

      if (
        typeof title !== "string" ||
        typeof description !== "string" ||
        typeof category !== "string" ||
        !Array.isArray(tags) ||
        allowComments !== true &&
        allowComments !== false &&
        allowComments !== 1 &&
        allowComments !== 0
      ) {
        response.status(400).json({
          message: "Invalid publication details.",
        });
        return;
      }

      const normalizedAllowComments = Boolean(allowComments);

      const [result] = await database.query(
        `
          update works
          set
            title = ?,
            description = ?,
            category = ?,
            tags = ?,
            cover_path = ?,
            allow_comments = ?,
            is_published = true,
            published_at = coalesce(
              published_at,
              current_timestamp(3)
            )
          where id = ? and author_id = ?
        `,
        [
          title.trim() || "Untitled Work",
          description.trim(),
          category,
          JSON.stringify(tags),
          typeof coverPath === "string" ? coverPath : null,
          normalizedAllowComments,
          request.params.workId,
          response.locals.userId,
        ],
      );

      const updateResult = result as {
        affectedRows: number;
      };

      if (updateResult.affectedRows === 0) {
        response.status(404).json({
          message: "Work not found.",
        });
        return;
      }

      response.json({
        message: "Work published successfully.",
      });
    } catch (error) {
      console.error(error);

      response.status(500).json({
        message: "Unable to publish this work.",
      });
    }
  },
);

app.put(
  "/api/my/projects/:projectId/publication",
  requireAuth,
  async (request, response) => {
    try {
      const currentUserId = response.locals.userId as string;
      const { projectId } = request.params;
      const { title, description, category, tags, allowComments } = request.body;

      if (
        typeof title !== "string" ||
        !title.trim() ||
        typeof description !== "string" ||
        typeof category !== "string" ||
        !Array.isArray(tags) ||
        tags.some((tag) => typeof tag !== "string") ||
        typeof allowComments !== "boolean"
      ) {
        response.status(400).json({ message: "Invalid project publication details." });
        return;
      }

      const normalizedTags = [...new Set(
        tags.map((tag) => tag.trim()).filter(Boolean),
      )].slice(0, 10);

      const [result] = await database.query(
        `
          update projects
          set
            title = ?,
            description = ?,
            category = ?,
            tags = ?,
            allow_comments = ?,
            is_published = true,
            published_at = coalesce(published_at, current_timestamp(3)),
            updated_at = current_timestamp(3)
          where id = ? and owner_id = ?
        `,
        [
          title.trim().slice(0, 150),
          description.trim(),
          category.trim().slice(0, 80) || null,
          JSON.stringify(normalizedTags),
          allowComments,
          projectId,
          currentUserId,
        ],
      );

      if ((result as { affectedRows: number }).affectedRows === 0) {
        response.status(404).json({ message: "Project not found." });
        return;
      }

      response.json({ message: "Project published successfully." });
    } catch (error) {
      console.error(error);
      response.status(500).json({ message: "Unable to publish this project." });
    }
  },
);

app.delete(
  "/api/my/projects/:projectId/publication",
  requireAuth,
  async (request, response) => {
    try {
      const [result] = await database.query(
        `
          update projects
          set is_published = false, updated_at = current_timestamp(3)
          where id = ? and owner_id = ?
        `,
        [request.params.projectId, response.locals.userId],
      );

      if ((result as { affectedRows: number }).affectedRows === 0) {
        response.status(404).json({ message: "Project not found." });
        return;
      }

      response.json({ message: "Project unpublished successfully." });
    } catch (error) {
      console.error(error);
      response.status(500).json({ message: "Unable to unpublish this project." });
    }
  },
);

app.get("/api/projects", async (_request, response) => {
  try {
    const [projects] = await database.query(
      `
        select
          projects.id,
          projects.title,
          projects.description,
          projects.cover_path,
          projects.category,
          projects.tags,
          projects.published_at,
          users.id as author_id,
          users.display_name as author_name,
          users.avatar_path as author_avatar_path,
          count(distinct project_items.id) as item_count,
          count(distinct project_likes.user_id) as like_count
        from projects
        inner join users on users.id = projects.owner_id
        left join project_items on project_items.project_id = projects.id
        left join project_likes on project_likes.project_id = projects.id
        where projects.is_published = true
        group by
          projects.id, projects.title, projects.description,
          projects.cover_path, projects.category, projects.tags,
          projects.published_at, users.id, users.display_name,
          users.avatar_path
        order by projects.published_at desc
      `,
    );

    response.json({ projects });
  } catch (error) {
    console.error(error);
    response.status(500).json({ message: "Unable to load published projects." });
  }
});

app.get("/api/projects/:projectId", async (request, response) => {
  try {
    const [projectRows] = await database.query(
      `
        select
          projects.id,
          projects.title,
          projects.description,
          projects.cover_path,
          projects.category,
          projects.tags,
          projects.allow_comments,
          projects.published_at,
          users.id as author_id,
          users.display_name as author_name,
          users.avatar_path as author_avatar_path,
          (
            select count(*)
            from project_likes
            where project_likes.project_id = projects.id
          ) as like_count
        from projects
        inner join users on users.id = projects.owner_id
        where projects.id = ? and projects.is_published = true
        limit 1
      `,
      [request.params.projectId],
    );

    const projects = projectRows as unknown[];
    if (projects.length === 0) {
      response.status(404).json({ message: "Published project not found." });
      return;
    }

    const [items] = await database.query(
      `
        select
          project_items.id as project_item_id,
          project_items.item_role,
          project_items.sort_order,
          works.id as work_id,
          works.title as work_title,
          works.work_type,
          works.content_json,
          works.updated_at as work_updated_at
        from project_items
        inner join works on works.id = project_items.work_id
        where project_items.project_id = ?
        order by project_items.sort_order asc, project_items.created_at asc
      `,
      [request.params.projectId],
    );

    response.json({ project: projects[0], items });
  } catch (error) {
    console.error(error);
    response.status(500).json({ message: "Unable to load this published project." });
  }
});

app.get(
  "/api/projects/:projectId/engagement",
  requireAuth,
  async (request, response) => {
    try {
      const projectId = request.params.projectId;
      const userId = response.locals.userId;
      const [projectRows] = await database.query(
        "select id from projects where id = ? and is_published = true limit 1",
        [projectId],
      );
      if ((projectRows as unknown[]).length === 0) {
        response.status(404).json({ message: "Published project not found." });
        return;
      }

      const [countRows] = await database.query(
        "select count(*) as like_count from project_likes where project_id = ?",
        [projectId],
      );
      const [likeRows] = await database.query(
        "select project_id from project_likes where project_id = ? and user_id = ? limit 1",
        [projectId, userId],
      );
      const [bookmarkRows] = await database.query(
        "select project_id from project_bookmarks where project_id = ? and user_id = ? limit 1",
        [projectId, userId],
      );

      response.json({
        likeCount: (countRows as Array<{ like_count: number }>)[0]?.like_count ?? 0,
        liked: (likeRows as unknown[]).length > 0,
        bookmarked: (bookmarkRows as unknown[]).length > 0,
      });
    } catch (error) {
      console.error(error);
      response.status(500).json({ message: "Unable to load project engagement." });
    }
  },
);

app.post("/api/projects/:projectId/like", requireAuth, async (request, response) => {
  try {
    await database.query(
      `insert ignore into project_likes (project_id, user_id)
       select id, ? from projects where id = ? and is_published = true`,
      [response.locals.userId, request.params.projectId],
    );
    response.json({ message: "Project liked successfully." });
  } catch (error) {
    console.error(error);
    response.status(500).json({ message: "Unable to like this project." });
  }
});

app.delete("/api/projects/:projectId/like", requireAuth, async (request, response) => {
  try {
    await database.query(
      "delete from project_likes where project_id = ? and user_id = ?",
      [request.params.projectId, response.locals.userId],
    );
    response.json({ message: "Project like removed." });
  } catch (error) {
    console.error(error);
    response.status(500).json({ message: "Unable to remove this project like." });
  }
});

app.post("/api/projects/:projectId/bookmark", requireAuth, async (request, response) => {
  try {
    await database.query(
      `insert ignore into project_bookmarks (project_id, user_id)
       select id, ? from projects where id = ? and is_published = true`,
      [response.locals.userId, request.params.projectId],
    );
    response.json({ message: "Project saved successfully." });
  } catch (error) {
    console.error(error);
    response.status(500).json({ message: "Unable to save this project." });
  }
});

app.delete("/api/projects/:projectId/bookmark", requireAuth, async (request, response) => {
  try {
    await database.query(
      "delete from project_bookmarks where project_id = ? and user_id = ?",
      [request.params.projectId, response.locals.userId],
    );
    response.json({ message: "Project bookmark removed." });
  } catch (error) {
    console.error(error);
    response.status(500).json({ message: "Unable to remove this project bookmark." });
  }
});

app.get("/api/projects/:projectId/comments", async (request, response) => {
  try {
    const [comments] = await database.query(
      `
        select
          project_comments.id,
          project_comments.content,
          project_comments.created_at,
          project_comments.updated_at,
          users.id as author_id,
          users.display_name as author_name,
          users.avatar_path as author_avatar_path
        from project_comments
        inner join users on users.id = project_comments.user_id
        inner join projects on projects.id = project_comments.project_id
        where project_comments.project_id = ? and projects.is_published = true
        order by project_comments.created_at asc
      `,
      [request.params.projectId],
    );
    response.json({ comments });
  } catch (error) {
    console.error(error);
    response.status(500).json({ message: "Unable to load project comments." });
  }
});

app.post(
  "/api/projects/:projectId/comments",
  requireAuth,
  async (request, response) => {
    try {
      const content = typeof request.body.content === "string"
        ? request.body.content.trim()
        : "";
      if (!content || content.length > 1000) {
        response.status(400).json({ message: "Comments must contain 1 to 1000 characters." });
        return;
      }

      const [projectRows] = await database.query(
        "select id from projects where id = ? and is_published = true and allow_comments = true limit 1",
        [request.params.projectId],
      );
      if ((projectRows as unknown[]).length === 0) {
        response.status(403).json({ message: "Comments are not available for this project." });
        return;
      }

      const commentId = randomUUID();
      await database.query(
        `insert into project_comments (id, project_id, user_id, content)
         values (?, ?, ?, ?)`,
        [commentId, request.params.projectId, response.locals.userId, content],
      );
      response.status(201).json({ message: "Comment created successfully.", commentId });
    } catch (error) {
      console.error(error);
      response.status(500).json({ message: "Unable to create this project comment." });
    }
  },
);

app.delete(
  "/api/project-comments/:commentId",
  requireAuth,
  async (request, response) => {
    try {
      const [result] = await database.query(
        "delete from project_comments where id = ? and user_id = ?",
        [request.params.commentId, response.locals.userId],
      );
      if ((result as { affectedRows: number }).affectedRows === 0) {
        response.status(404).json({ message: "Comment not found." });
        return;
      }
      response.json({ message: "Comment deleted successfully." });
    } catch (error) {
      console.error(error);
      response.status(500).json({ message: "Unable to delete this project comment." });
    }
  },
);

app.get("/api/works/:workId", async (request, response) => {
  try {
    const [rows] = await database.query(
      `
        select
          works.id,
          works.title,
          works.work_type,
          works.content_json,
          works.description,
          works.cover_path,
          works.category,
          works.tags,
          works.allow_comments,
          works.published_at,
          users.id as author_id,
          users.display_name as author_name,
          users.avatar_path as author_avatar_path
        from works
        inner join users
          on works.author_id = users.id
        where works.id = ?
          and works.is_published = true
        limit 1
      `,
      [request.params.workId],
    );

    const works = rows as unknown[];

    if (works.length === 0) {
      response.status(404).json({
        message: "Published work not found.",
      });
      return;
    }

    response.json({
      work: works[0],
    });
  } catch (error) {
    console.error(error);

    response.status(500).json({
      message: "Unable to load this published work.",
    });
  }
});

app.post(
  "/api/works/:workId/like",
  requireAuth,
  async (request, response) => {
    try {
      const [publishedRows] = await database.query(
        `
          select id
          from works
          where id = ? and is_published = true
          limit 1
        `,
        [request.params.workId],
      );

      const publishedWorks = publishedRows as unknown[];

      if (publishedWorks.length === 0) {
        response.status(404).json({
          message: "Published work not found.",
        });
        return;
      }

      await database.query(
        `
          insert ignore into work_likes (
            work_id,
            user_id
          )
          values (?, ?)
        `,
        [
          request.params.workId,
          response.locals.userId,
        ],
      );

      response.json({
        message: "Work liked successfully.",
      });
    } catch (error) {
      console.error(error);

      response.status(500).json({
        message: "Unable to like this work.",
      });
    }
  },
);

app.delete(
  "/api/works/:workId/like",
  requireAuth,
  async (request, response) => {
    try {
      await database.query(
        `
          delete from work_likes
          where work_id = ? and user_id = ?
        `,
        [
          request.params.workId,
          response.locals.userId,
        ],
      );

      response.json({
        message: "Like removed successfully.",
      });
    } catch (error) {
      console.error(error);

      response.status(500).json({
        message: "Unable to remove this like.",
      });
    }
  },
);

app.get(
  "/api/works/:workId/like-status",
  requireAuth,
  async (request, response) => {
    try {
      const [publishedRows] = await database.query(
        `
          select id
          from works
          where id = ? and is_published = true
          limit 1
        `,
        [request.params.workId],
      );

      const publishedWorks = publishedRows as unknown[];

      if (publishedWorks.length === 0) {
        response.status(404).json({
          message: "Published work not found.",
        });
        return;
      }

      const [countRows] = await database.query(
        `
          select count(*) as likeCount
          from work_likes
          where work_id = ?
        `,
        [request.params.workId],
      );

      const [likedRows] = await database.query(
        `
          select work_id
          from work_likes
          where work_id = ? and user_id = ?
          limit 1
        `,
        [
          request.params.workId,
          response.locals.userId,
        ],
      );

      const likeCount = (
        countRows as Array<{ likeCount: number }>
      )[0]?.likeCount ?? 0;

      const liked = (likedRows as unknown[]).length > 0;

      response.json({
        likeCount,
        liked,
      });
    } catch (error) {
      console.error(error);

      response.status(500).json({
        message: "Unable to load like status.",
      });
    }
  },
);

app.post(
  "/api/works/:workId/bookmark",
  requireAuth,
  async (request, response) => {
    try {
      const [publishedRows] = await database.query(
        `
          select id
          from works
          where id = ? and is_published = true
          limit 1
        `,
        [request.params.workId],
      );

      if ((publishedRows as unknown[]).length === 0) {
        response.status(404).json({
          message: "Published work not found.",
        });
        return;
      }

      await database.query(
        `
          insert ignore into work_bookmarks (
            work_id,
            user_id
          )
          values (?, ?)
        `,
        [
          request.params.workId,
          response.locals.userId,
        ],
      );

      response.json({
        message: "Work saved successfully.",
      });
    } catch (error) {
      console.error(error);

      response.status(500).json({
        message: "Unable to save this work.",
      });
    }
  },
);

app.delete(
  "/api/works/:workId/bookmark",
  requireAuth,
  async (request, response) => {
    try {
      await database.query(
        `
          delete from work_bookmarks
          where work_id = ? and user_id = ?
        `,
        [
          request.params.workId,
          response.locals.userId,
        ],
      );

      response.json({
        message: "Bookmark removed successfully.",
      });
    } catch (error) {
      console.error(error);

      response.status(500).json({
        message: "Unable to remove this bookmark.",
      });
    }
  },
);

app.get(
  "/api/works/:workId/bookmark-status",
  requireAuth,
  async (request, response) => {
    try {
      const [rows] = await database.query(
        `
          select work_id
          from work_bookmarks
          where work_id = ? and user_id = ?
          limit 1
        `,
        [
          request.params.workId,
          response.locals.userId,
        ],
      );

      response.json({
        bookmarked: (rows as unknown[]).length > 0,
      });
    } catch (error) {
      console.error(error);

      response.status(500).json({
        message: "Unable to load bookmark status.",
      });
    }
  },
);

app.get("/api/my/bookmarks", requireAuth, async (_request, response) => {
  try {
    const [works] = await database.query(
      `
        select
          works.id,
          works.title,
          works.work_type,
          works.description,
          works.cover_path,
          works.category,
          works.tags,
          works.published_at,
          users.display_name as author_name,
          work_bookmarks.created_at as bookmarked_at
        from work_bookmarks
        inner join works
          on work_bookmarks.work_id = works.id
        inner join users
          on works.author_id = users.id
        where work_bookmarks.user_id = ?
          and works.is_published = true
        order by work_bookmarks.created_at desc
      `,
      [response.locals.userId],
    );

    response.json({ works });
  } catch (error) {
    console.error(error);

    response.status(500).json({
      message: "Unable to load saved works.",
    });
  }
});

app.get("/api/my/likes", requireAuth, async (_request, response) => {
  try {
    const [works] = await database.query(
      `
        select
          works.id,
          works.title,
          works.work_type,
          works.description,
          works.cover_path,
          works.category,
          works.tags,
          works.published_at,
          users.display_name as author_name,
          work_likes.created_at as liked_at
        from work_likes
        inner join works
          on work_likes.work_id = works.id
        inner join users
          on works.author_id = users.id
        where work_likes.user_id = ?
          and works.is_published = true
        order by work_likes.created_at desc
      `,
      [response.locals.userId],
    );

    response.json({ works });
  } catch (error) {
    console.error(error);

    response.status(500).json({
      message: "Unable to load liked works.",
    });
  }
});

app.get("/api/works/:workId/comments", async (request, response) => {
  try {
    const [comments] = await database.query(
      `
        select
          comments.id,
          comments.content,
          comments.created_at,
          comments.updated_at,
          users.id as author_id,
          users.display_name as author_name,
          users.avatar_path as author_avatar_path
        from comments
        inner join users
          on comments.user_id = users.id
        inner join works
          on comments.work_id = works.id
        where comments.work_id = ?
          and works.is_published = true
        order by comments.created_at asc
      `,
      [request.params.workId],
    );

    response.json({ comments });
  } catch (error) {
    console.error(error);

    response.status(500).json({
      message: "Unable to load comments.",
    });
  }
});

app.post(
  "/api/works/:workId/comments",
  requireAuth,
  async (request, response) => {
    try {
      const { content } = request.body;

      if (
        typeof content !== "string" ||
        !content.trim()
      ) {
        response.status(400).json({
          message: "Comment content is required.",
        });
        return;
      }

      if (content.trim().length > 1000) {
        response.status(400).json({
          message: "Comments must be 1000 characters or fewer.",
        });
        return;
      }

      const [publishedRows] = await database.query(
        `
          select id
          from works
          where id = ?
            and is_published = true
            and allow_comments = true
          limit 1
        `,
        [request.params.workId],
      );

      if ((publishedRows as unknown[]).length === 0) {
        response.status(403).json({
          message: "Comments are not available for this work.",
        });
        return;
      }

      const commentId = randomUUID();

      await database.query(
        `
          insert into comments (
            id,
            work_id,
            user_id,
            content
          )
          values (?, ?, ?, ?)
        `,
        [
          commentId,
          request.params.workId,
          response.locals.userId,
          content.trim(),
        ],
      );

      response.status(201).json({
        message: "Comment created successfully.",
        commentId,
      });
    } catch (error) {
      console.error(error);

      response.status(500).json({
        message: "Unable to create comment.",
      });
    }
  },
);

app.get("/api/my/profile", requireAuth, async (_request, response) => {
  try {
    const [rows] = await database.query(
      `
        select
          id,
          email,
          display_name,
          avatar_path,
          bio,
          created_at
        from users
        where id = ?
        limit 1
      `,
      [response.locals.userId],
    );

    const users = rows as unknown[];

    if (users.length === 0) {
      response.status(404).json({
        message: "User profile not found.",
      });
      return;
    }

    response.json({
      user: users[0],
    });
  } catch (error) {
    console.error(error);

    response.status(500).json({
      message: "Unable to load profile.",
    });
  }
});

app.put("/api/my/profile", requireAuth, async (request, response) => {
  try {
    const { displayName, bio, avatarPath } = request.body;

    if (
      typeof displayName !== "string" ||
      typeof bio !== "string"
    ) {
      response.status(400).json({
        message: "Display name and bio are required.",
      });
      return;
    }

    if (
      displayName.trim().length < 1 ||
      displayName.trim().length > 80
    ) {
      response.status(400).json({
        message: "Display name must be between 1 and 80 characters.",
      });
      return;
    }

    if (bio.length > 500) {
      response.status(400).json({
        message: "Bio must be 500 characters or fewer.",
      });
      return;
    }

    await database.query(
      `
        update users
        set
          display_name = ?,
          bio = ?,
          avatar_path = ?
        where id = ?
      `,
      [
        displayName.trim(),
        bio.trim(),
        typeof avatarPath === "string"
          ? avatarPath
          : null,
        response.locals.userId,
      ],
    );

    response.json({
      message: "Profile updated successfully.",
    });
  } catch (error) {
    console.error(error);

    response.status(500).json({
      message: "Unable to update profile.",
    });
  }
});

app.put(
  "/api/my/works/:workId/unpublish",
  requireAuth,
  async (request, response) => {
    try {
      const [result] = await database.query(
        `
          update works
          set
            is_published = false,
            published_at = null
          where id = ? and author_id = ?
        `,
        [
          request.params.workId,
          response.locals.userId,
        ],
      );

      const updateResult = result as {
        affectedRows: number;
      };

      if (updateResult.affectedRows === 0) {
        response.status(404).json({
          message: "Work not found.",
        });
        return;
      }

      response.json({
        message: "Work is now private.",
      });
    } catch (error) {
      console.error(error);

      response.status(500).json({
        message: "Unable to unpublish this work.",
      });
    }
  },
);

app.delete(
  "/api/comments/:commentId",
  requireAuth,
  async (request, response) => {
    try {
      const [result] = await database.query(
        `
          delete from comments
          where id = ? and user_id = ?
        `,
        [
          request.params.commentId,
          response.locals.userId,
        ],
      );

      const deleteResult = result as {
        affectedRows: number;
      };

      if (deleteResult.affectedRows === 0) {
        response.status(404).json({
          message: "Comment not found or not owned by you.",
        });
        return;
      }

      response.json({
        message: "Comment deleted successfully.",
      });
    } catch (error) {
      console.error(error);

      response.status(500).json({
        message: "Unable to delete comment.",
      });
    }
  },
);

app.post(
  "/api/users/:userId/follow",
  requireAuth,
  async (request, response) => {
    try {
      const followingId = request.params.userId;
      const followerId = response.locals.userId;

      if (followingId === followerId) {
        response.status(400).json({
          message: "You cannot follow yourself.",
        });
        return;
      }

      await database.query(
        `
          insert ignore into user_follows (
            follower_id,
            following_id
          )
          values (?, ?)
        `,
        [followerId, followingId],
      );

      response.json({
        message: "Creator followed successfully.",
      });
    } catch (error) {
      console.error(error);

      response.status(500).json({
        message: "Unable to follow this creator.",
      });
    }
  },
);

app.delete(
  "/api/users/:userId/follow",
  requireAuth,
  async (request, response) => {
    try {
      await database.query(
        `
          delete from user_follows
          where follower_id = ? and following_id = ?
        `,
        [
          response.locals.userId,
          request.params.userId,
        ],
      );

      response.json({
        message: "Creator unfollowed successfully.",
      });
    } catch (error) {
      console.error(error);

      response.status(500).json({
        message: "Unable to unfollow this creator.",
      });
    }
  },
);

app.get(
  "/api/users/:userId/follow-status",
  requireAuth,
  async (request, response) => {
    try {
      const [rows] = await database.query(
        `
          select following_id
          from user_follows
          where follower_id = ? and following_id = ?
          limit 1
        `,
        [
          response.locals.userId,
          request.params.userId,
        ],
      );

      response.json({
        following: (rows as unknown[]).length > 0,
      });
    } catch (error) {
      console.error(error);

      response.status(500).json({
        message: "Unable to load follow status.",
      });
    }
  },
);

app.get("/api/my/following", requireAuth, async (_request, response) => {
  try {
    const [creators] = await database.query(
      `
        select
          users.id,
          users.display_name,
          users.avatar_path,
          users.bio,
          user_follows.created_at as followed_at
        from user_follows
        inner join users
          on user_follows.following_id = users.id
        where user_follows.follower_id = ?
        order by user_follows.created_at desc
      `,
      [response.locals.userId],
    );

    response.json({ creators });
  } catch (error) {
    console.error(error);

    response.status(500).json({
      message: "Unable to load followed creators.",
    });
  }
});

app.get("/api/creators/:creatorId", async (request, response) => {
  try {
    const [userRows] = await database.query(
      `
        select
          id,
          display_name,
          avatar_path,
          bio,
          created_at
        from users
        where id = ?
        limit 1
      `,
      [request.params.creatorId],
    );

    const users = userRows as unknown[];

    if (users.length === 0) {
      response.status(404).json({
        message: "Creator not found.",
      });
      return;
    }

    const [works] = await database.query(
      `
        select
          id,
          title,
          description,
          cover_path,
          category,
          tags,
          work_type,
          published_at
        from works
        where author_id = ?
          and is_published = true
        order by published_at desc
      `,
      [request.params.creatorId],
    );

    response.json({
      creator: users[0],
      works,
    });
  } catch (error) {
    console.error(error);

    response.status(500).json({
      message: "Unable to load creator profile.",
    });
  }
});

app.get(
  "/api/my/works/:workId/collaborators",
  requireAuth,
  async (request, response) => {
    try {
      const [ownerRows] = await database.query(
        `
          select id
          from works
          where id = ? and author_id = ?
          limit 1
        `,
        [
          request.params.workId,
          response.locals.userId,
        ],
      );

      if ((ownerRows as unknown[]).length === 0) {
        response.status(403).json({
          message: "Only the work owner can manage collaborators.",
        });
        return;
      }

      const [collaborators] = await database.query(
        `
          select
            users.id,
            users.email,
            users.display_name,
            users.avatar_path,
            work_collaborators.role
          from work_collaborators
          inner join users
            on work_collaborators.user_id = users.id
          where work_collaborators.work_id = ?
          order by work_collaborators.created_at asc
        `,
        [request.params.workId],
      );

      response.json({ collaborators });
    } catch (error) {
      console.error(error);

      response.status(500).json({
        message: "Unable to load collaborators.",
      });
    }
  },
);

app.post(
  "/api/my/works/:workId/collaborators",
  requireAuth,
  async (request, response) => {
    try {
      const { email, role } = request.body;

      if (typeof email !== "string") {
        response.status(400).json({
          message: "Collaborator email is required.",
        });
        return;
      }

      const collaboratorRole =
        role === "viewer" ? "viewer" : "editor";

      const [ownerRows] = await database.query(
        `
          select id
          from works
          where id = ? and author_id = ?
          limit 1
        `,
        [
          request.params.workId,
          response.locals.userId,
        ],
      );

      if ((ownerRows as unknown[]).length === 0) {
        response.status(403).json({
          message: "Only the work owner can add collaborators.",
        });
        return;
      }

      const [userRows] = await database.query(
        `
          select id
          from users
          where email = ?
          limit 1
        `,
        [email.trim().toLowerCase()],
      );

      const users = userRows as Array<{ id: string }>;

      if (!users[0]) {
        response.status(404).json({
          message: "No WriteFlow user exists with this email.",
        });
        return;
      }

      if (users[0].id === response.locals.userId) {
        response.status(400).json({
          message: "You are already the owner of this work.",
        });
        return;
      }

      await database.query(
        `
          insert into work_collaborators (
            work_id,
            user_id,
            role
          )
          values (?, ?, ?)
          on duplicate key update role = values(role)
        `,
        [
          request.params.workId,
          users[0].id,
          collaboratorRole,
        ],
      );

      response.json({
        message: "Collaborator added successfully.",
      });
    } catch (error) {
      console.error(error);

      response.status(500).json({
        message: "Unable to add collaborator.",
      });
    }
  },
);

app.delete(
  "/api/my/works/:workId/collaborators/:userId",
  requireAuth,
  async (request, response) => {
    try {
      const [result] = await database.query(
        `
          delete work_collaborators
          from work_collaborators
          inner join works
            on work_collaborators.work_id = works.id
          where work_collaborators.work_id = ?
            and work_collaborators.user_id = ?
            and works.author_id = ?
        `,
        [
          request.params.workId,
          request.params.userId,
          response.locals.userId,
        ],
      );

      const deleteResult = result as {
        affectedRows: number;
      };

      if (deleteResult.affectedRows === 0) {
        response.status(404).json({
          message: "Collaborator not found.",
        });
        return;
      }

      response.json({
        message: "Collaborator removed successfully.",
      });
    } catch (error) {
      console.error(error);

      response.status(500).json({
        message: "Unable to remove collaborator.",
      });
    }
  },
);

const PORT = Number(process.env.PORT) || 3000;

type ActiveWorkMember = {
  socketId: string;
  displayName: string;
  avatarPath: string | null;
};

const activeWorkMembers = new Map<
  string,
  Map<string, ActiveWorkMember>
>();

function getWorkMembers(workId: string) {
  let members = activeWorkMembers.get(workId);

  if (!members) {
    members = new Map<
      string,
      ActiveWorkMember
    >();

    activeWorkMembers.set(workId, members);
  }

  return members;
}

function broadcastWorkPresence(workId: string) {
  const members = [
    ...getWorkMembers(workId).values(),
  ];

  io.to(`work:${workId}`).emit(
    "presence-updated",
    {
      workId,
      members,
    },
  );
}

io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  const currentUserId =
    socket.data.userId as string;

  socket.join(`user:${currentUserId}`);

  socket.on(
    "join-work",
    async (workId: string) => {
      if (
        typeof workId !== "string" ||
        !workId.trim()
      ) {
        socket.emit(
          "work-access-denied",
          {
            message: "Invalid work ID.",
          },
        );
        return;
      }

      const currentUserId =
        socket.data.userId as string;

      try {
        const [rows] = await database.query(
          `
            select
              works.id,
              users.display_name,
              users.avatar_path
            from works
            inner join users
              on users.id = ?
            where works.id = ?
              and (
                works.author_id = ?
                or exists (
                  select 1
                  from work_collaborators
                  where work_collaborators.work_id = works.id
                    and work_collaborators.user_id = ?
                )
              )
            limit 1
          `,
          [
            currentUserId,
            workId,
            currentUserId,
            currentUserId,
          ],
        );

        const matchedRows = rows as Array<{
          id: string;
          display_name: string;
          avatar_path: string | null;
        }>;

        const work = matchedRows[0];

        if (!work) {
          socket.emit(
            "work-access-denied",
            {
              message:
                "You do not have access to this work.",
            },
          );
          return;
        }

        const roomName = `work:${workId}`;

        const members =
          getWorkMembers(workId);

        const wasAlreadyInRoom =
          members.has(socket.id);

        socket.data.displayName =
          work.display_name;

        socket.join(roomName);

        members.set(socket.id, {
          socketId: socket.id,
          displayName: work.display_name,
          avatarPath: work.avatar_path,
        });

        if (!wasAlreadyInRoom) {
          socket.to(roomName).emit(
            "collaborator-joined",
            {
              socketId: socket.id,
              displayName: work.display_name,
            },
          );
        }

        broadcastWorkPresence(workId);
      } catch (error) {
        console.error(error);

        socket.emit(
          "work-access-denied",
          {
            message:
              "Unable to join the collaboration room.",
          },
        );
      }
    },
  );

  socket.on(
    "leave-work",
    (workId: string) => {
      if (typeof workId !== "string") {
        return;
      }

      const roomName = `work:${workId}`;

      socket.leave(roomName);

      const members =
        getWorkMembers(workId);

      const member = members.get(socket.id);

      members.delete(socket.id);

      socket.to(roomName).emit(
        "collaborator-left",
        {
          socketId: socket.id,
          displayName:
            member?.displayName ??
            "A collaborator",
        },
      );

      broadcastWorkPresence(workId);
    },
  );

  socket.on("disconnecting", () => {
    for (const roomName of socket.rooms) {
      if (!roomName.startsWith("work:")) {
        continue;
      }

      const workId = roomName.slice(
        "work:".length,
      );

      const members =
        getWorkMembers(workId);

      const member = members.get(socket.id);

      members.delete(socket.id);

      socket.to(roomName).emit(
        "collaborator-left",
        {
          socketId: socket.id,
          displayName:
            member?.displayName ??
            "A collaborator",
        },
      );

      broadcastWorkPresence(workId);
    }
  });

  socket.on("disconnect", () => {
    console.log(
      `Socket disconnected: ${socket.id}`,
    );
  });
});

httpServer.listen(PORT, () => {
  console.log(
    `WriteFlow API is running at http://localhost:${PORT}`,
  );
});
