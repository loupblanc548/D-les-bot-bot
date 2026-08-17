terraform {
  required_version = ">= 1.5"
  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.45"
    }
  }
}

variable "hcloud_token" {
  sensitive   = true
  description = "Hetzner Cloud API token"
}

variable "ssh_keys" {
  type    = list(string)
  default = ["bot-ssh-key"]
}

variable "server_name" {
  default = "discord-bot-vps"
}

variable "server_type" {
  default = "cx22"
}

variable "image" {
  default = "ubuntu-24.04"
}

variable "location" {
  default = "fsn1"
}

provider "hcloud" {
  token = var.hcloud_token
}

resource "hcloud_server" "bot" {
  name        = var.server_name
  server_type = var.server_type
  image       = var.image
  location    = var.location
  ssh_keys    = var.ssh_keys

  firewall_ids = [hcloud_firewall.bot.id]

  labels = {
    environment = "production"
    service     = "discord-bot"
  }
}

resource "hcloud_firewall" "bot" {
  name = "bot-firewall"

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "22"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "80"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
}

output "server_ip" {
  value = hcloud_server.bot.ipv4_address
}

output "server_id" {
  value = hcloud_server.bot.id
}
