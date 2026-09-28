# ManHunt IRL

PWA de jeu de chasse en conditions réelles avec géolocalisation temps réel.

Un groupe d'amis choisit des **Chasseurs** et des **Proies** dans une zone géographique définie. Les Chasseurs traquent les Proies via leur position GPS diffusée à intervalle configurable. Les Proies doivent survivre jusqu'à la fin du chronomètre.

## Stack

| Couche | Techno |
|--------|--------|
| Frontend | SvelteKit (PWA) |
| Backend | Fastify + TypeScript |
| Temps réel | WebSockets (`@fastify/websocket`) |
| Persistance | Aucune BDD — état en RAM (`Map`) |
| Reverse proxy | Nginx |

## Prérequis

- Node.js **20+**
- npm **9+**
- Un VPS Linux avec Nginx (pour la production)
- Un nom de domaine avec certificat SSL (Let's Encrypt)

## Installation

```bash
git clone https://github.com/EAnathos/manhunt-irl.git
cd manhunt-irl
npm install
```

## Développement

```bash
# Lancer backend + frontend en parallèle
npm run dev

# Ou séparément
npm run dev -w apps/backend       # http://localhost:3001
npm run dev -w apps/frontend      # http://localhost:5173
```

Le frontend se connecte au backend sur `http://localhost:3001` par défaut. Configurable via les variables d'environnement :

```
VITE_API_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001
```

## Build de production

```bash
npm run build
```

Cela génère :
- `apps/backend/dist/` — Backend compilé (Node.js)
- `apps/frontend/build/` — Frontend statique (SvelteKit)

## Déploiement

### 1. Backend (PM2)

```bash
# Sur le serveur
cd /var/www/manhunt
npm ci --production
pm2 start apps/backend/dist/server.js --name manhunt
pm2 save
```

### 2. Frontend (fichiers statiques)

```bash
# Copier le build vers le dossier servi par Nginx
cp -r apps/frontend/build/ /var/www/manhunt/frontend/build/
```

### 3. Nginx

Copier la config fournie et adapter le nom de domaine :

```bash
sudo cp infra/nginx-manhunt.conf /etc/nginx/sites-available/manhunt
sudo ln -s /etc/nginx/sites-available/manhunt /etc/nginx/sites-enabled/
# Éditer server_name et les chemins SSL
sudo nginx -t && sudo systemctl reload nginx
```

La config gère :
- Redirection HTTP → HTTPS
- Reverse proxy API (`/api/`) → Fastify `:3001`
- Upgrade WebSocket (`/ws`) → Fastify `:3001`
- Fichiers statiques SvelteKit avec cache 30 jours
- Timeouts WS à 24h pour les connexions longues

### 4. SSL (Let's Encrypt)

```bash
sudo certbot --nginx -d manhunt.example.com
```

### 5. Règles du jeu

Le fichier `rules.json` à la racine du projet contient les règles affichées dans l'app. Il est modifiable sans redéployer le code — un simple rechargement de la page suffit.

## Vérifications

```bash
npm run lint          # Lint tous les workspaces
npm run typecheck     # TypeScript strict
npm run test          # Tests unitaires (vitest)
```

## Architecture

```
manhunt-irl/
├── apps/
│   ├── backend/        # Fastify — API HTTP + WebSocket
│   └── frontend/       # SvelteKit — PWA
├── packages/
│   └── types/          # Interfaces TypeScript partagées
├── infra/
│   └── nginx-manhunt.conf
├── rules.json          # Contenu des règles (modifiable sans redéploiement)
├── SPEC.md             # Spécification fonctionnelle complète
└── CLAUDE.md           # Conventions de développement
```

### Choix techniques

- **Pas de base de données** : les parties durent quelques dizaines de minutes max. L'état est purgé 5 min après la fin d'une partie. Un `Map<string, Game>` en RAM suffit.
- **Pas d'authentification** : les joueurs choisissent un pseudo et reçoivent un `session_id` opaque stocké en `localStorage`. C'est un jeu entre amis, pas une plateforme compétitive.
- **Positions des Proies contrôlées côté serveur** : jamais routées vers d'autres Proies, bloquées pendant le délai de grâce. Aucune confiance accordée au client.

## Licence

MIT — voir [LICENSE.md](LICENSE.md)
