# Guide de Whitelist xcancel.com

## Pourquoi cette whitelist est nécessaire ?

Le bot utilise `xcancel.com` pour récupérer les flux RSS de Twitter/X. Ce service exige une whitelist pour éviter les abus.

## Comment obtenir la whitelist ?

1. Envoyez un email à : `rss@xcancel.com`
2. Incluez les informations suivantes :
   - **User-Agent** : `DiscordSurveillanceBot/1.0`
   - **Description** : Bot Discord de surveillance des réseaux sociaux
   - **Usage** : Surveillance de comptes Twitter pour notifications automatiques

## Après l'envoi

- Vous recevrez un ID de whitelist
- Le bot affichera un avertissement dans la console si la whitelist n'est pas active
- Une fois whitelisted, les flux RSS fonctionneront normalement

## Vérification

Pour vérifier si votre bot est whitelisted, utilisez la commande :
```
/testrss [handle] twitter
```

Si vous voyez le message "⚠️ Whitelist requise", suivez les étapes ci-dessus.

## Erreurs courantes

- **"RSS reader not yet whitelisted"** : Votre bot n'est pas encore whitelisted
- **HTTP 403/429** : Trop de requêtes ou IP bloquée
- **Timeout** : Le service xcancel.com est temporairement indisponible

## Alternatives

Si xcancel.com ne fonctionne pas, vous pouvez :
- Utiliser Bluesky à la place (via bsky.app/profile/[handle]/rss)
- Utiliser des flux RSS YouTube (plus fiables)
- Configurer votre propre instance Nitter (auto-hébergé)
