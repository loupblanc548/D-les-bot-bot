/**
 * musicGroup.ts — Commandes musicales (sous-commandes)
 */
import { ChatInputCommandInteraction, SlashCommandBuilder, Client } from "discord.js";
import { handleMusic } from "./stubHandlers.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("music")
    .setDescription("Commandes musicales (lecture, queue, playlist, radio)")
    .addSubcommand((sc) =>
      sc
        .setName("play")
        .setDescription("Joue une musique (YouTube/Spotify)")
        .addStringOption((o) => o.setName("requete").setDescription("Titre ou URL").setRequired(true)),
    )
    .addSubcommand((sc) => sc.setName("stop").setDescription("Arrête la musique et vide la queue"))
    .addSubcommand((sc) => sc.setName("pause").setDescription("Met en pause"))
    .addSubcommand((sc) => sc.setName("resume").setDescription("Reprend la lecture"))
    .addSubcommand((sc) => sc.setName("skip").setDescription("Passe à la musique suivante"))
    .addSubcommand((sc) => sc.setName("previous").setDescription("Revient à la musique précédente"))
    .addSubcommand((sc) => sc.setName("shuffle").setDescription("Active le mode aléatoire"))
    .addSubcommand((sc) =>
      sc
        .setName("loop")
        .setDescription("Mode de boucle")
        .addStringOption((o) =>
          o
            .setName("mode")
            .setDescription("Mode de boucle")
            .setRequired(false)
            .addChoices(
              { name: "Désactivé", value: "off" },
              { name: "Musique actuelle", value: "track" },
              { name: "File d'attente", value: "queue" },
            ),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("seek")
        .setDescription("Aller à une position")
        .addStringOption((o) => o.setName("position").setDescription("Position (ex: 1:30, 90s)").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("volume")
        .setDescription("Régler le volume")
        .addIntegerOption((o) => o.setName("volume").setDescription("Volume 0-100").setRequired(true).setMinValue(0).setMaxValue(100)),
    )
    .addSubcommand((sc) => sc.setName("queue").setDescription("Voir la file d'attente"))
    .addSubcommand((sc) => sc.setName("nowplaying").setDescription("Musique en cours de lecture"))
    .addSubcommand((sc) =>
      sc
        .setName("lyrics")
        .setDescription("Paroles de la musique en cours ou d'un titre")
        .addStringOption((o) => o.setName("titre").setDescription("Titre de la chanson").setRequired(false)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("playlist-add")
        .setDescription("Crée une playlist")
        .addStringOption((o) => o.setName("nom").setDescription("Nom de la playlist").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("playlist-play")
        .setDescription("Joue une playlist")
        .addStringOption((o) => o.setName("nom").setDescription("Nom de la playlist").setRequired(true)),
    )
    .addSubcommand((sc) => sc.setName("playlist-list").setDescription("Liste tes playlists"))
    .addSubcommand((sc) =>
      sc
        .setName("playlist-delete")
        .setDescription("Supprime une playlist")
        .addStringOption((o) => o.setName("nom").setDescription("Nom de la playlist").setRequired(true)),
    )
    .addSubcommand((sc) => sc.setName("radio").setDescription("Démarre la radio gaming"))
    .addSubcommand((sc) => sc.setName("radio-stop").setDescription("Arrête la radio"))
    .addSubcommand((sc) => sc.setName("audio-effects").setDescription("Effets audio (bassboost, nightcore, 8d)"))
    .toJSON(),
];

export async function handleCommand(interaction: ChatInputCommandInteraction, client: Client): Promise<void> {
  await handleMusic(interaction, client);
}
