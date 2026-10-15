# Copilot instructions

## Project overview

snackamusik is a personal, public-facing album journal. Visitors can browse records and their cover art, scores, value notes and reviews. Only email addresses configured in `GLOBAL_ADMIN_EMAILS` can create, edit or delete entries. Keep the architecture small and low-cost.

The frontend is React, TypeScript and Vite. The backend is an Azure Functions API integrated with Azure Static Web Apps. Album metadata is persisted in Azure Table Storage; cover images are in a private Azure Blob Storage container. Azure resources are provisioned with Bicep and deployed using GitHub Actions with OIDC.

The website is exclusively for a Swedish audience: all visible interface text, accessibility labels, validation messages, and page metadata must be in Swedish. Do not add language switching or English UI copy.

## Project structure

- `src/App.tsx`: record shelf, album detail view, and admin editor.
- `src/lib/api.ts`: typed browser API requests and the development-only mock identity header.
- `src/types.ts`: frontend album and viewer types.
- `src/index.css`: responsive visual design.
- `api/src/domain.ts`: album types and Zod request validation.
- `api/src/index.ts`: HTTP API, Static Web Apps identity parsing, and admin authorization.
- `api/src/repository.ts`: repository interface, in-memory development store, and Azure Table/Blob implementation.
- `public/staticwebapp.config.json`: Static Web Apps routing and API runtime configuration.
- `infra/`: Bicep entry point and resource modules.
- `.github/workflows/`: application and infrastructure build/deploy workflows.
- `README.md`: local setup, deployment, and API documentation.

## Code conventions

- Use TypeScript for application and API code. Preserve strict type checking; avoid `any` and unsafe casts.
- Keep the frontend responsive, accessible, and consistent with the existing record-journal design.
- Validate and constrain API inputs with Zod schemas in `api/src/domain.ts`. Return actionable client errors for invalid input and log unexpected failures.
- Keep persistence behind the `Repository` interface. Implement behavior for both `MemoryRepository` and `TableRepository`.
- Store album metadata in the `Albums` table. Store image bytes in the private `album-artwork` Blob container, not in Table entities.
- Supported artwork is JPEG, PNG or WebP, with a maximum size of 8 MB. Validate actual image signatures server-side; do not trust filenames or browser MIME types.
- Album and artwork scores are from 0 to 5 in half-point increments. Amounts are Swedish kronor (SEK).
- Keep API DTOs, frontend types, and README descriptions in sync when changing album fields or endpoints.
- Update `README.md` for changes to local setup, domain behavior, authentication, infrastructure, required GitHub settings, routes, or deployment.

## Authentication and authorization

- Production identity must come from the trusted Static Web Apps `x-ms-client-principal` header. Never trust a client-supplied role, email, or identity for authorization.
- The API checks the authenticated email against the comma-separated `GLOBAL_ADMIN_EMAILS` server setting for every write operation.
- `x-dev-user-email` is for local development only. Accept it only when `DEV_AUTH=true` and `NODE_ENV` is not `production`; never enable it in Azure.
- Public album listing and artwork reads are intentional. Create, update, and delete must remain administrator-only.
- Keep Blob Storage private. Never return a storage URL, key, or connection string to the browser.
- The integrated Static Web Apps managed Functions API currently uses the server-side `STORAGE_CONNECTION_STRING` configured by Bicep. Do not put storage credentials in frontend code, repository files, GitHub workflow arguments, or responses.
- Use Static Web Apps' built-in Microsoft Entra ID (`aad`) provider unless a complete custom provider setup is explicitly requested. Do not imply other identity providers are configured.

## Build and validation

- Frontend: `npm ci` then `npm run build` from the repository root.
- Functions API: `npm ci` then `npm run build` from `api/`.
- Infrastructure: `az bicep build --file infra/main.bicep`.
- For changes, run the smallest relevant checks and exercise changed API behavior where practical. Run `git diff --check` before finishing.
- Keep both root and API lockfiles committed when dependencies change. Do not install packages unless a dependency manifest changes or a validation command reports a missing package.
- Do not commit generated build output, local Functions settings, secrets, or Azure credentials.

## Infrastructure and deployment

- Define Azure resources in Bicep under `infra/` and reuse the existing modules where practical.
- Keep the Static Web Apps integrated Functions architecture and GitHub OIDC federation. Do not add a client-secret requirement for Azure login.
- Keep workflow triggers and README deployment instructions aligned with changes to infrastructure parameters, secrets, variables, routes, or build paths.
- Infrastructure is not necessarily deployed just because the Bicep templates exist; state deployment status explicitly.
