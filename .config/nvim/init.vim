" vim-plug
call plug#begin()
Plug 'takac/vim-hardtime'
Plug 'scrooloose/nerdtree'
Plug 'tpope/vim-surround'
Plug 'scrooloose/nerdcommenter'
Plug 'jiangmiao/auto-pairs'
Plug 'sheerun/vim-polyglot'
Plug 'sonph/onehalf', {'rtp': 'vim/'}
Plug 'ayu-theme/ayu-vim'
Plug 'vim-airline/vim-airline'
Plug 'vim-airline/vim-airline-themes'
Plug 'terryma/vim-multiple-cursors'
call plug#end()
" :PlugInstall to install new plugins

filetype plugin indent on
syntax on
set t_Co=256
let ayucolor='mirage'
colorscheme ayu
set cursorline

set number
set relativenumber
set incsearch
set ignorecase
set smartcase
set nohlsearch
set expandtab
set tabstop=2
set shiftwidth=2
set nowrap
set noshowmode
inoremap jk <ESC>
"copy whole line with Y
noremap Y y$

" truecolor
if exists('+termguicolors')
  let &t_8f = "\<Esc>[38;2;%lu;%lu;%lum"
  let &t_8b = "\<Esc>[48;2;%lu;%lu;%lum"
  set termguicolors
endif

" automatic toggling between line number modes
augroup numbertoggle
   autocmd!
   autocmd BufEnter,FocusGained,InsertLeave * set relativenumber
   autocmd BufLeave,FocusLost,InsertEnter   * set norelativenumber
augroup END
